// Frontend prototype: features operate locally in this browser tab.

const $ = (id) => document.getElementById(id);

let name = "";
let cameraStream = null;
let screenStream = null;
let clock = null;
let started = 0;
let drawing = false;
let erase = false;

const fileURLs = [];
const canvas = $("canvas");
const ctx = canvas.getContext("2d");

// Display status messages.
function status(message) {
    $("status").textContent = message;
}

// Stop all tracks in a media stream.
function stop(stream) {
    stream?.getTracks().forEach((track) => track.stop());
}

// Update video preview and control labels.
function renderPreview() {
    $("preview").srcObject = screenStream || cameraStream;

    $("placeholder").classList.toggle(
        "hidden",
        Boolean(screenStream || cameraStream)
    );

    $("camera").textContent = cameraStream
        ? "Stop camera"
        : "Start camera";

    $("screen").textContent = screenStream
        ? "Stop sharing"
        : "Share screen";

    const audio = cameraStream?.getAudioTracks()[0];

    $("mic").disabled = !audio;
    $("mic").textContent = audio?.enabled
        ? "Mute mic"
        : "Unmute mic";
}

// Set a white background for drawing and PNG export.
function resetBoard() {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

resetBoard();

// Enter the workspace.
$("joinForm").addEventListener("submit", (event) => {
    event.preventDefault();

    name = $("displayName").value.trim();
    const room = $("roomName").value.trim();

    if (!name || !room) return;

    $("meetingTitle").textContent = room;
    $("initial").textContent = name[0].toUpperCase();
    $("selfLabel").textContent = `${name} (you)`;
    $("person").textContent = `${name} (you)`;

    $("welcome").classList.add("hidden");
    $("workspace").classList.remove("hidden");

    started = Date.now();

    clock = setInterval(() => {
        const seconds = Math.floor((Date.now() - started) / 1000);

        const minutesText = String(
            Math.floor(seconds / 60)
        ).padStart(2, "0");

        const secondsText = String(seconds % 60).padStart(2, "0");

        $("timer").textContent = `${minutesText}:${secondsText}`;
    }, 1000);
});

// Start or stop camera and microphone.
$("camera").addEventListener("click", async () => {
    if (cameraStream) {
        stop(cameraStream);
        cameraStream = null;
        renderPreview();
        return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
        status(
            "Camera access requires a supported browser on HTTPS or localhost."
        );
        return;
    }

    $("camera").disabled = true;
    $("leave").disabled = true;

    try {
        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
        });

        status("Camera and microphone enabled locally.");
    } catch (error) {
        status(
            `Could not access camera/microphone: ${error.name}. ` +
            "Check browser permissions and devices."
        );
    } finally {
        $("camera").disabled = false;
        $("leave").disabled = false;
        renderPreview();
    }
});

// Mute or unmute microphone.
$("mic").addEventListener("click", () => {
    cameraStream?.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
    });

    renderPreview();
});

// Start or stop screen sharing preview.
$("screen").addEventListener("click", async () => {
    if (screenStream) {
        stop(screenStream);
        screenStream = null;
        renderPreview();
        return;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
        status(
            "Screen sharing requires a supported desktop browser " +
            "on HTTPS or localhost."
        );
        return;
    }

    $("screen").disabled = true;
    $("leave").disabled = true;

    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
        });

        screenStream.getVideoTracks()[0].addEventListener("ended", () => {
            stop(screenStream);
            screenStream = null;
            renderPreview();
        });

        status("Screen preview enabled locally.");
    } catch (error) {
        status(
            `Screen sharing was cancelled or unavailable: ${error.name}`
        );
    } finally {
        $("screen").disabled = false;
        $("leave").disabled = false;
        renderPreview();
    }
});

// Switch between Chat, Files, and People.
document.querySelectorAll("[data-panel]").forEach((button) => {
    button.addEventListener("click", () => {
        document.querySelectorAll("[data-panel]").forEach((tab) => {
            const active = tab === button;

            tab.setAttribute("aria-selected", String(active));
            $(tab.dataset.panel).classList.toggle("hidden", !active);
        });
    });
});

// Add local chat messages.
$("chatForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const text = $("messageInput").value.trim();
    if (!text) return;

    const item = document.createElement("div");
    item.className = "message";

    const author = document.createElement("small");
    const time = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });

    author.textContent = `${name} • ${time}`;

    const body = document.createElement("p");

    // textContent prevents messages from being interpreted as HTML.
    body.textContent = text;

    item.append(author, body);
    $("messages").append(item);

    $("messageInput").value = "";
    $("messages").scrollTop = $("messages").scrollHeight;
});

// Create local download links for selected files.
$("fileInput").addEventListener("change", (event) => {
    for (const file of event.target.files) {
        if (file.size > 10 * 1024 * 1024) {
            status(`${file.name} exceeds the 10 MB limit.`);
            continue;
        }

        const link = document.createElement("a");
        const url = URL.createObjectURL(file);

        fileURLs.push(url);

        link.href = url;
        link.download = file.name;
        link.className = "file";

        link.textContent =
            `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;

        $("fileList").append(link);
    }

    event.target.value = "";
});

// Convert pointer coordinates to canvas coordinates.
function point(event) {
    const bounds = canvas.getBoundingClientRect();

    return [
        (event.clientX - bounds.left) * canvas.width / bounds.width,
        (event.clientY - bounds.top) * canvas.height / bounds.height,
    ];
}

// Begin drawing.
canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;

    drawing = true;
    canvas.setPointerCapture(event.pointerId);

    const [x, y] = point(event);

    ctx.strokeStyle = erase ? "#ffffff" : $("color").value;

    ctx.lineWidth = erase
        ? Number($("size").value) * 4
        : Number($("size").value);

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
});

// Continue drawing.
canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;

    ctx.lineTo(...point(event));
    ctx.stroke();
});

// End drawing.
["pointerup", "pointercancel", "lostpointercapture"].forEach(
    (type) => {
        canvas.addEventListener(type, () => {
            drawing = false;
        });
    }
);

// Toggle eraser.
$("eraser").addEventListener("click", () => {
    erase = !erase;

    $("eraser").textContent = `Eraser: ${erase ? "on" : "off"}`;
    $("eraser").setAttribute("aria-pressed", String(erase));
});

// Clear whiteboard.
$("clearBoard").addEventListener("click", resetBoard);

// Show or hide whiteboard.
$("boardToggle").addEventListener("click", () => {
    const hidden = $("board").classList.toggle("hidden");

    $("boardToggle").textContent = hidden
        ? "Show board"
        : "Hide board";

    $("boardToggle").setAttribute(
        "aria-expanded",
        String(!hidden)
    );
});

// Download whiteboard as a PNG.
$("saveBoard").addEventListener("click", () => {
    const link = document.createElement("a");

    link.download = "meetspace-whiteboard.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
});

// Release media tracks, timer, and file URLs.
function cleanup() {
    stop(cameraStream);
    stop(screenStream);

    cameraStream = null;
    screenStream = null;

    clearInterval(clock);

    fileURLs.forEach((url) => URL.revokeObjectURL(url));
    fileURLs.length = 0;
}

// Leave workspace.
$("leave").addEventListener("click", () => {
    cleanup();
    renderPreview();

    $("workspace").classList.add("hidden");
    $("welcome").classList.remove("hidden");

    $("messages").replaceChildren();
    $("fileList").replaceChildren();
    $("messageInput").value = "";
    $("timer").textContent = "00:00";

    resetBoard();

    status("Ready. Camera access starts only when requested.");
});

// Release resources when leaving the page.
window.addEventListener("pagehide", cleanup);