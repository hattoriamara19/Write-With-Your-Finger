import {
    FilesetResolver,
    HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22";


/* =========================================================
   AIRWRITE
   Finger Writing App
   ========================================================= */


/* -----------------------------
   ELEMENTS
----------------------------- */

const video = document.getElementById("camera");

const canvas = document.getElementById("drawingCanvas");

const ctx = canvas.getContext("2d");

const startCameraButton =
    document.getElementById("startCamera");

const switchCameraButton =
    document.getElementById("switchCamera");

const clearButton =
    document.getElementById("clearCanvas");

const undoButton =
    document.getElementById("undo");

const redoButton =
    document.getElementById("redo");

const saveButton =
    document.getElementById("saveImage");

const brushSizeInput =
    document.getElementById("brushSize");

const brushValue =
    document.getElementById("brushValue");

const eraserButton =
    document.getElementById("eraser");

const statusElement =
    document.getElementById("status");

const cameraMessage =
    document.getElementById("cameraMessage");

const pointer =
    document.getElementById("fingerPointer");

const colorButtons =
    document.querySelectorAll(".color");


/* -----------------------------
   VARIABLES
----------------------------- */

let handLandmarker = null;

let stream = null;

let cameraRunning = false;

let currentFacingMode = "user";

let animationFrameId = null;

let lastVideoTime = -1;

let drawing = false;

let lastX = null;

let lastY = null;

let brushColor = "#00ff66";

let brushSize = 7;

let eraserMode = false;


/* -----------------------------
   UNDO / REDO
----------------------------- */

let undoStack = [];

let redoStack = [];


/* =========================================================
   MEDIAPIPE INITIALIZATION
   ========================================================= */

async function initializeHandLandmarker() {

    try {

        statusElement.textContent =
            "Loading hand tracking...";

        const vision =
            await FilesetResolver.forVisionTasks(
                "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
            );


        handLandmarker =
            await HandLandmarker.createFromOptions(
                vision,
                {
                    baseOptions: {
                        modelAssetPath:
                            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",

                        delegate: "GPU"
                    },

                    runningMode: "VIDEO",

                    numHands: 1,

                    minHandDetectionConfidence: 0.5,

                    minHandPresenceConfidence: 0.5,

                    minTrackingConfidence: 0.5
                }
            );


        statusElement.textContent =
            "Ready";

    } catch (error) {

        console.error(error);

        statusElement.textContent =
            "Hand tracker error";

        alert(
            "Could not load the hand tracking model.\n\n" +
            "Check your internet connection and reload the page."
        );
    }
}


/* =========================================================
   CAMERA
   ========================================================= */

async function startCamera() {

    try {

        stopCamera();

        cameraMessage.textContent =
            "Starting camera...";

        cameraMessage.style.display =
            "block";


        stream =
            await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: {
                        ideal: currentFacingMode
                    },

                    width: {
                        ideal: 1280
                    },

                    height: {
                        ideal: 720
                    }
                },

                audio: false
            });


        video.srcObject = stream;

        await video.play();


        cameraRunning = true;

        cameraMessage.style.display =
            "none";

        startCameraButton.textContent =
            "🟢 Camera Running";

        statusElement.textContent =
            "Camera ready";


        resizeCanvas();


        if (!animationFrameId) {

            animationFrameId =
                requestAnimationFrame(processFrame);
        }

    } catch (error) {

        console.error(error);

        cameraRunning = false;

        cameraMessage.textContent =
            "Camera permission required";

        cameraMessage.style.display =
            "block";

        statusElement.textContent =
            "Camera unavailable";

        alert(
            "Camera could not be started.\n\n" +
            "Please allow camera permission and try again."
        );
    }
}


function stopCamera() {

    if (stream) {

        stream.getTracks().forEach(track => {
            track.stop();
        });

        stream = null;
    }

    video.srcObject = null;

    cameraRunning = false;

    drawing = false;

    lastX = null;

    lastY = null;

    pointer.style.display =
        "none";
}


/* =========================================================
   SWITCH CAMERA
   ========================================================= */

async function switchCamera() {

    currentFacingMode =
        currentFacingMode === "user"
            ? "environment"
            : "user";

    if (cameraRunning) {

        await startCamera();

    } else {

        statusElement.textContent =
            currentFacingMode === "user"
                ? "Front camera selected"
                : "Back camera selected";
    }
}


/* =========================================================
   CANVAS
   ========================================================= */

function resizeCanvas() {

    const rect =
        canvas.getBoundingClientRect();


    const oldCanvas =
        document.createElement("canvas");

    oldCanvas.width =
        canvas.width;

    oldCanvas.height =
        canvas.height;

    const oldCtx =
        oldCanvas.getContext("2d");

    if (canvas.width > 0 && canvas.height > 0) {

        oldCtx.drawImage(
            canvas,
            0,
            0
        );
    }


    canvas.width =
        Math.max(1, Math.floor(rect.width));

    canvas.height =
        Math.max(1, Math.floor(rect.height));


    if (
        oldCanvas.width > 0 &&
        oldCanvas.height > 0
    ) {

        ctx.drawImage(
            oldCanvas,
            0,
            0,
            oldCanvas.width,
            oldCanvas.height,
            0,
            0,
            canvas.width,
            canvas.height
        );
    }


    setupDrawingContext();
}


function setupDrawingContext() {

    ctx.lineCap =
        "round";

    ctx.lineJoin =
        "round";

    ctx.lineWidth =
        brushSize;

    ctx.strokeStyle =
        brushColor;
}


window.addEventListener(
    "resize",
    resizeCanvas
);


/* =========================================================
   PROCESS CAMERA FRAMES
   ========================================================= */

async function processFrame() {

    animationFrameId = null;


    if (
        cameraRunning &&
        handLandmarker &&
        video.readyState >= 2
    ) {

        if (
            video.currentTime !==
            lastVideoTime
        ) {

            lastVideoTime =
                video.currentTime;


            try {

                const results =
                    handLandmarker.detectForVideo(
                        video,
                        performance.now()
                    );


                handleHandResults(results);

            } catch (error) {

                console.error(
                    "Detection error:",
                    error
                );
            }
        }
    }


    animationFrameId =
        requestAnimationFrame(processFrame);
}


/* =========================================================
   HAND DETECTION
   ========================================================= */

function handleHandResults(results) {

    if (
        !results ||
        !results.landmarks ||
        results.landmarks.length === 0
    ) {

        stopDrawing();

        pointer.style.display =
            "none";

        statusElement.textContent =
            cameraRunning
                ? "Show your hand"
                : "Camera stopped";

        return;
    }


    const hand =
        results.landmarks[0];


    /*
        MediaPipe hand landmark 8
        = index finger tip
    */

    const indexTip =
        hand[8];


    /*
        Landmark coordinates are 0-1.
        Because the displayed video is mirrored,
        we mirror X as well.
    */

    const x =
        (1 - indexTip.x) *
        canvas.width;

    const y =
        indexTip.y *
        canvas.height;


    showPointer(x, y);


    /*
        Determine whether index finger
        is extended.

        Landmark:
        8  = index tip
        6  = index PIP
        5  = index MCP

        If tip is above PIP, index is
        considered extended.
    */

    const indexExtended =
        hand[8].y <
        hand[6].y;


    /*
        Thumb / finger movement can sometimes
        cause false drawing.

        We also require the index finger
        to be reasonably extended.
    */

    if (indexExtended) {

        drawAt(x, y);

        statusElement.textContent =
            "✍️ Writing";

    } else {

        stopDrawing();

        statusElement.textContent =
            "☝️ Raise index finger to write";
    }
}


/* =========================================================
   POINTER
   ========================================================= */

function showPointer(x, y) {

    pointer.style.display =
        "block";

    pointer.style.left =
        `${x}px`;

    pointer.style.top =
        `${y}px`;


    if (eraserMode) {

        pointer.style.background =
            "#ffffff";

        pointer.style.boxShadow =
            "0 0 15px white";

    } else {

        pointer.style.background =
            brushColor;

        pointer.style.boxShadow =
            `0 0 10px ${brushColor},
             0 0 25px ${brushColor}`;
    }
}


/* =========================================================
   DRAWING
   ========================================================= */

function drawAt(x, y) {

    if (!drawing) {

        drawing = true;

        lastX = x;

        lastY = y;

        return;
    }


    if (
        lastX === null ||
        lastY === null
    ) {

        lastX = x;

        lastY = y;

        return;
    }


    /*
        Distance check prevents strange
        lines when tracking jumps.
    */

    const dx =
        x - lastX;

    const dy =
        y - lastY;

    const distance =
        Math.sqrt(
            dx * dx +
            dy * dy
        );


    if (distance > 150) {

        lastX = x;

        lastY = y;

        return;
    }


    ctx.beginPath();

    ctx.moveTo(
        lastX,
        lastY
    );

    ctx.lineTo(
        x,
        y
    );


    if (eraserMode) {

        ctx.globalCompositeOperation =
            "destination-out";

        ctx.lineWidth =
            brushSize * 2;

    } else {

        ctx.globalCompositeOperation =
            "source-over";

        ctx.strokeStyle =
            brushColor;

        ctx.lineWidth =
            brushSize;
    }


    ctx.stroke();


    ctx.globalCompositeOperation =
        "source-over";


    lastX = x;

    lastY = y;
}


function stopDrawing() {

    if (drawing) {

        saveUndoState();

    }

    drawing = false;

    lastX = null;

    lastY = null;
}


/* =========================================================
   UNDO / REDO
   ========================================================= */

function getCanvasImage() {

    return canvas.toDataURL(
        "image/png"
    );
}


function restoreCanvas(data) {

    const image =
        new Image();

    image.onload = () => {

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.drawImage(
            image,
            0,
            0,
            canvas.width,
            canvas.height
        );
    };

    image.src = data;
}


function saveUndoState() {

    const image =
        getCanvasImage();

    undoStack.push(image);

    if (undoStack.length > 30) {

        undoStack.shift();
    }

    redoStack = [];
}


function undo() {

    if (undoStack.length === 0) {
        return;
    }


    const current =
        getCanvasImage();

    redoStack.push(current);


    const previous =
        undoStack.pop();


    restoreCanvas(previous);
}


function redo() {

    if (redoStack.length === 0) {
        return;
    }


    const current =
        getCanvasImage();

    undoStack.push(current);


    const next =
        redoStack.pop();


    restoreCanvas(next);
}


/* =========================================================
   CLEAR
   ========================================================= */

function clearCanvas() {

    saveUndoState();

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    drawing = false;

    lastX = null;

    lastY = null;
}


/* =========================================================
   SAVE IMAGE
   ========================================================= */

function saveImage() {

    const image =
        canvas.toDataURL(
            "image/png"
        );


    const link =
        document.createElement("a");

    link.download =
        "AirWrite-Drawing.png";

    link.href =
        image;

    link.click();
}


/* =========================================================
   BRUSH
   ========================================================= */

brushSizeInput.addEventListener(
    "input",
    () => {

        brushSize =
            Number(
                brushSizeInput.value
            );

        brushValue.textContent =
            `${brushSize} px`;

        setupDrawingContext();
    }
);


/* =========================================================
   COLORS
   ========================================================= */

colorButtons.forEach(button => {

    button.addEventListener(
        "click",
        () => {

            colorButtons.forEach(
                item =>
                    item.classList.remove(
                        "active"
                    )
            );


            button.classList.add(
                "active"
            );


            brushColor =
                button.dataset.color;


            eraserMode =
                false;


            eraserButton.textContent =
                "Eraser OFF";


            pointer.style.background =
                brushColor;


            setupDrawingContext();
        }
    );
});


/* =========================================================
   ERASER
   ========================================================= */

eraserButton.addEventListener(
    "click",
    () => {

        eraserMode =
            !eraserMode;


        eraserButton.textContent =
            eraserMode
                ? "🧽 Eraser ON"
                : "Eraser OFF";


        if (eraserMode) {

            pointer.style.background =
                "#ffffff";

        } else {

            pointer.style.background =
                brushColor;
        }
    }
);


/* =========================================================
   BUTTON EVENTS
   ========================================================= */

startCameraButton.addEventListener(
    "click",
    async () => {

        if (!cameraRunning) {

            await startCamera();

        } else {

            stopCamera();

            startCameraButton.textContent =
                "📷 Start Camera";

            statusElement.textContent =
                "Camera stopped";
        }
    }
);


switchCameraButton.addEventListener(
    "click",
    switchCamera
);


clearButton.addEventListener(
    "click",
    clearCanvas
);


undoButton.addEventListener(
    "click",
    undo
);


redoButton.addEventListener(
    "click",
    redo
);


saveButton.addEventListener(
    "click",
    saveImage
);


/* =========================================================
   STARTUP
   ========================================================= */

window.addEventListener(
    "load",
    async () => {

        resizeCanvas();

        await initializeHandLandmarker();

    }
);
