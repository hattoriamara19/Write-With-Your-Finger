import {
    FilesetResolver,
    HandLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/vision_bundle.mjs";

const video = document.getElementById("camera");
const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d");

const startButton = document.getElementById("startCamera");
const switchButton = document.getElementById("switchCamera");
const clearButton = document.getElementById("clearCanvas");
const undoButton = document.getElementById("undo");
const redoButton = document.getElementById("redo");
const saveButton = document.getElementById("saveImage");

const status = document.getElementById("status");
const message = document.getElementById("cameraMessage");
const pointer = document.getElementById("fingerPointer");

const brushSizeInput = document.getElementById("brushSize");
const brushValue = document.getElementById("brushValue");
const eraserButton = document.getElementById("eraser");

const colorButtons = document.querySelectorAll(".color");

let handLandmarker = null;
let stream = null;
let running = false;
let facingMode = "user";

let brushColor = "#00ff66";
let brushSize = 7;
let eraser = false;

let drawing = false;
let lastX = null;
let lastY = null;

let undoStack = [];
let redoStack = [];


// =====================================================
// INITIALIZE HAND TRACKING
// =====================================================

async function loadHandTracking() {

    try {

        status.textContent = "Loading hand tracking...";

        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm"
        );

        handLandmarker = await HandLandmarker.createFromOptions(
            vision,
            {
                baseOptions: {
                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
                },

                runningMode: "VIDEO",

                numHands: 1,

                minHandDetectionConfidence: 0.5,

                minHandPresenceConfidence: 0.5,

                minTrackingConfidence: 0.5
            }
        );

        status.textContent = "Ready";

        console.log("Hand tracking loaded.");

    } catch (error) {

        console.error(
            "MediaPipe loading error:",
            error
        );

        status.textContent =
            "Hand tracking unavailable";

        /*
          Camera can still work even if
          hand tracking fails.
        */
    }
}


// =====================================================
// START CAMERA
// =====================================================

async function startCamera() {

    try {

        // Check browser support
        if (!navigator.mediaDevices ||
            !navigator.mediaDevices.getUserMedia) {

            throw new Error(
                "Camera API is not supported."
            );
        }


        // Stop previous camera
        stopCamera();


        message.textContent =
            "Requesting camera permission...";

        message.style.display = "block";


        /*
          Camera settings.
          Do NOT force exact resolution.
        */

        const constraints = {

            video: {
                facingMode: facingMode,
                width: {
                    ideal: 1280
                },
                height: {
                    ideal: 720
                }
            },

            audio: false
        };


        console.log(
            "Requesting camera:",
            constraints
        );


        stream =
            await navigator.mediaDevices.getUserMedia(
                constraints
            );


        console.log(
            "Camera stream obtained."
        );


        video.srcObject = stream;


        await new Promise(resolve => {

            video.onloadedmetadata = resolve;

        });


        await video.play();


        running = true;


        message.style.display = "none";

        startButton.textContent =
            "⏹️ Stop Camera";

        status.textContent =
            "Camera running";


        resizeCanvas();


        requestAnimationFrame(processFrame);


    } catch (error) {

        console.error(
            "CAMERA ERROR:",
            error
        );


        running = false;


        message.style.display = "block";


        if (error.name === "NotAllowedError") {

            message.innerHTML =
                "🚫 Camera permission denied.<br>" +
                "Allow camera permission and reload.";

        } else if (error.name === "NotFoundError") {

            message.textContent =
                "📷 No camera found.";

        } else if (error.name === "NotReadableError") {

            message.textContent =
                "⚠️ Camera is being used by another app.";

        } else if (error.name === "SecurityError") {

            message.textContent =
                "🔒 Camera requires HTTPS.";

        } else {

            message.textContent =
                "❌ Camera error: " +
                error.message;
        }


        status.textContent =
            "Camera error";
    }
}


// =====================================================
// STOP CAMERA
// =====================================================

function stopCamera() {

    if (stream) {

        stream.getTracks().forEach(
            track => track.stop()
        );

        stream = null;
    }


    video.srcObject = null;

    running = false;

    drawing = false;

    lastX = null;
    lastY = null;

    pointer.style.display = "none";
}


// =====================================================
// SWITCH CAMERA
// =====================================================

async function switchCamera() {

    facingMode =
        facingMode === "user"
            ? "environment"
            : "user";


    if (running) {

        await startCamera();

    } else {

        status.textContent =
            facingMode === "user"
                ? "Front camera selected"
                : "Back camera selected";
    }
}


// =====================================================
// CANVAS
// =====================================================

function resizeCanvas() {

    const rect =
        canvas.getBoundingClientRect();

    canvas.width =
        Math.max(1, Math.floor(rect.width));

    canvas.height =
        Math.max(1, Math.floor(rect.height));

    setupCanvas();
}


function setupCanvas() {

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.lineWidth = brushSize;

    ctx.strokeStyle = brushColor;
}


window.addEventListener(
    "resize",
    resizeCanvas
);


// =====================================================
// CAMERA FRAME PROCESSING
// =====================================================

function processFrame() {

    if (!running) {
        return;
    }


    if (
        handLandmarker &&
        video.readyState >= 2
    ) {

        try {

            const results =
                handLandmarker.detectForVideo(
                    video,
                    performance.now()
                );

            processHands(results);

        } catch (error) {

            console.error(
                "Hand detection error:",
                error
            );
        }
    }


    requestAnimationFrame(processFrame);
}


// =====================================================
// HAND PROCESSING
// =====================================================

function processHands(results) {

    if (
        !results ||
        !results.landmarks ||
        results.landmarks.length === 0
    ) {

        stopWriting();

        pointer.style.display = "none";

        status.textContent =
            "Show your hand";

        return;
    }


    const hand =
        results.landmarks[0];


    // Index finger tip = landmark 8

    const tip = hand[8];


    /*
      Camera image is mirrored because
      CSS uses scaleX(-1).
    */

    const x =
        (1 - tip.x) * canvas.width;

    const y =
        tip.y * canvas.height;


    pointer.style.display = "block";

    pointer.style.left =
        x + "px";

    pointer.style.top =
        y + "px";


    /*
      Index finger extended:
      tip 8 should be above PIP 6.
    */

    const indexExtended =
        hand[8].y < hand[6].y;


    if (indexExtended) {

        status.textContent =
            "✍️ Writing";

        draw(x, y);

    } else {

        status.textContent =
            "☝️ Raise index finger";

        stopWriting();
    }
}


// =====================================================
// DRAW
// =====================================================

function draw(x, y) {

    if (!drawing) {

        saveState();

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


    const dx = x - lastX;
    const dy = y - lastY;

    const distance =
        Math.sqrt(
            dx * dx +
            dy * dy
        );


    // Ignore sudden tracking jumps

    if (distance > 120) {

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


    if (eraser) {

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


function stopWriting() {

    drawing = false;

    lastX = null;
    lastY = null;
}


// =====================================================
// UNDO
// =====================================================

function saveState() {

    undoStack.push(
        canvas.toDataURL()
    );

    if (undoStack.length > 30) {

        undoStack.shift();
    }

    redoStack = [];
}


function restore(data) {

    const image =
        new Image();

    image.onload = function () {

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


function undo() {

    if (undoStack.length === 0) {
        return;
    }


    redoStack.push(
        canvas.toDataURL()
    );


    const previous =
        undoStack.pop();


    restore(previous);
}


function redo() {

    if (redoStack.length === 0) {
        return;
    }


    undoStack.push(
        canvas.toDataURL()
    );


    const next =
        redoStack.pop();


    restore(next);
}


// =====================================================
// CLEAR
// =====================================================

function clearCanvas() {

    saveState();

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );
}


// =====================================================
// SAVE
// =====================================================

function saveImage() {

    const link =
        document.createElement("a");

    link.download =
        "AirWrite.png";

    link.href =
        canvas.toDataURL(
            "image/png"
        );

    link.click();
}


// =====================================================
// BRUSH
// =====================================================

brushSizeInput.addEventListener(
    "input",
    function () {

        brushSize =
            Number(
                this.value
            );

        brushValue.textContent =
            brushSize + " px";

        setupCanvas();
    }
);


// =====================================================
// COLORS
// =====================================================

colorButtons.forEach(
    button => {

        button.addEventListener(
            "click",
            function () {

                colorButtons.forEach(
                    b =>
                        b.classList.remove(
                            "active"
                        )
                );


                this.classList.add(
                    "active"
                );


                brushColor =
                    this.dataset.color;


                eraser = false;


                eraserButton.textContent =
                    "Eraser OFF";


                pointer.style.background =
                    brushColor;


                setupCanvas();
            }
        );
    }
);


// =====================================================
// ERASER
// =====================================================

eraserButton.addEventListener(
    "click",
    function () {

        eraser = !eraser;

        this.textContent =
            eraser
                ? "🧽 Eraser ON"
                : "Eraser OFF";
    }
);


// =====================================================
// BUTTONS
// =====================================================

startButton.addEventListener(
    "click",
    async function () {

        if (running) {

            stopCamera();

            this.textContent =
                "📷 Start Camera";

            status.textContent =
                "Camera stopped";

            message.textContent =
                "Camera not started";

            message.style.display =
                "block";

        } else {

            await startCamera();
        }
    }
);


switchButton.addEventListener(
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


// =====================================================
// STARTUP
// =====================================================

resizeCanvas();

loadHandTracking();
