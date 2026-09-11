import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

// Run against `npm run dev -- --host 127.0.0.1`. Uses synthetic media only.
const base = process.env.APP_URL || "http://127.0.0.1:5173";
// A looping tone makes silent or missing microphone transport fail the test.
await mkdir("test-results", { recursive: true });
const wav = Buffer.alloc(44 + 48000 * 2);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(48000, 24);
wav.writeUInt32LE(96000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < 48000; i++)
  wav.writeInt16LE(
    Math.round(12000 * Math.sin((2 * Math.PI * 440 * i) / 48000)),
    44 + i * 2,
  );
await writeFile("test-results/microphone.wav", wav);
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-audio-capture=${resolve("test-results/microphone.wav")}`,
  ],
});
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  permissions: ["camera", "microphone", "clipboard-read", "clipboard-write"],
});
context.on("page", (page) =>
  page.on("pageerror", (error) => errors.push(error.message)),
);
const page = await context.newPage();
await page.addInitScript(() => {
  const capture = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices,
  );
  window.capturedSources = [];
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await capture(constraints);
    if (constraints.video) {
      const original = stream.getVideoTracks()[0];
      original.stop();
      stream.removeTrack(original);
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      const paint = () => {
        ctx.fillStyle = "#e02020";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#20b040";
        ctx.fillRect(canvas.width / 4, 0, canvas.width / 2, canvas.height);
      };
      paint();
      const track = canvas.captureStream(30).getVideoTracks()[0];
      const timer = setInterval(
        () => (track.readyState === "ended" ? clearInterval(timer) : paint()),
        33,
      );
      stream.addTrack(track);
      window.cameraSource = { canvas, track };
    }
    window.capturedSources.push(stream);
    return stream;
  };
});

async function assertFrameColor(tab, selector, zoomed) {
  await tab.waitForFunction(
    ({ selector, zoomed }) => {
      const video = document.querySelector(selector);
      if (!video?.videoWidth) return false;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(
        video,
        video.videoWidth * 0.1,
        video.videoHeight * 0.5,
        1,
        1,
        0,
        0,
        1,
        1,
      );
      const [r, g] = ctx.getImageData(0, 0, 1, 1).data;
      return zoomed ? g > 100 && r < 100 : r > 150 && g < 100;
    },
    { selector, zoomed },
  );
}

async function measureRemoteAudio(tab) {
  await tab.evaluate(async () => {
    const context = new AudioContext();
    const stream = document.querySelector("audio").srcObject;
    const analyser = context.createAnalyser();
    context
      .createMediaStreamSource(new MediaStream(stream.getAudioTracks()))
      .connect(analyser);
    await context.resume();
    window.audioCheck = { context, analyser };
  });
}

async function assertRemoteAudio(tab, audible) {
  await tab.waitForFunction((audible) => {
    const { analyser } = window.audioCheck;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    const peak = Math.max(...samples.map(Math.abs));
    return audible ? peak > 0.01 : peak < 0.001;
  }, audible);
}

async function assertMusicInput() {
  assert.deepEqual(
    await page.locator("video.mirrored").evaluate((video) => {
      const track = video.srcObject.getAudioTracks()[0];
      const { echoCancellation, noiseSuppression, autoGainControl } =
        track.getSettings();
      return {
        echoCancellation,
        noiseSuppression,
        autoGainControl,
        contentHint: track.contentHint,
      };
    }),
    {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      contentHint: "music",
    },
    "Microphone audio preserves singing without speech cleanup or automatic gain",
  );
}

async function assertFits(label) {
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const overflow = await page.evaluate(() => ({
    page:
      document.documentElement.scrollHeight > innerHeight ||
      document.documentElement.scrollWidth > innerWidth,
    controls: [...document.querySelectorAll("button, input, .video-stage")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width &&
          rect.height &&
          (rect.top < 0 ||
            rect.left < 0 ||
            rect.right > innerWidth ||
            rect.bottom > innerHeight)
        );
      })
      .map(
        (element) =>
          element.getAttribute("aria-label") ||
          element.textContent ||
          element.className,
      ),
  }));
  assert.deepEqual(overflow, { page: false, controls: [] }, label);
  const stage = await page.locator(".video-stage").boundingBox();
  assert.ok(
    stage.height >= 100,
    `${label}: preview must remain usable, got ${stage.height}px high`,
  );
}

try {
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Less distance. More connection." })
    .waitFor();
  assert.equal(
    await page.locator("video").evaluate((video) => video.srcObject),
    null,
    "No media captured before consent",
  );
  await page.screenshot({
    path: "test-results/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "How it works" }).click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").isVisible(), false);
  await page.getByRole("button", { name: "Join a call", exact: true }).click();
  await page.getByRole("button", { name: "Join call", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Paste a call link" })
    .waitFor();
  await page.getByLabel("Call link or code").fill("not-a-call");
  await page.getByRole("button", { name: "Join call", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "doesn’t look right" })
    .waitFor();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Dismiss message" }).click();
  await page
    .getByRole("button", { name: "Create a call", exact: true })
    .click();
  await page.screenshot({
    path: "test-results/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    `Mobile layout must not overflow: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("body *")].filter((element) => element.getBoundingClientRect().right > innerWidth).map((element) => ({ tag: element.tagName, class: element.className, right: element.getBoundingClientRect().right }))))}`,
  );
  for (const width of [320, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `No overflow at ${width}px`,
    );
  }
  for (const [width, height] of [
    [1440, 1080],
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [390, 844],
    [320, 568],
    [667, 375],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await assertFits(`Lobby fits on one page at ${width}×${height}`);
    await page
      .getByRole("button", { name: "Join a call", exact: true })
      .click();
    await assertFits(`Join form fits at ${width}×${height}`);
    await page
      .getByRole("button", { name: "Create a call", exact: true })
      .click();
    if (width === 320)
      await page.screenshot({ path: "test-results/lobby-small.png" });
  }
  await page.getByRole("button", { name: "Devices", exact: true }).click();
  await page.getByRole("dialog", { name: "Camera & audio" }).waitFor();
  await page.getByLabel("Microphone", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Enable camera & mic", exact: true })
    .click();
  const zoom = page.getByRole("slider", { name: "Camera zoom" });
  await zoom.waitFor();
  await assertMusicInput();
  await assertFrameColor(page, "video.mirrored", false);
  assert.equal(
    await page
      .locator("video.mirrored")
      .evaluate((video) => getComputedStyle(video).objectFit),
    "contain",
    "The full camera frame is visible at default zoom",
  );
  await zoom.press("End");
  assert.equal(await zoom.inputValue(), "3");
  await assertFrameColor(page, "video.mirrored", true);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  assert.equal(await zoom.inputValue(), "1");
  await page.getByRole("button", { name: "Stop preview", exact: true }).click();
  await page.getByRole("button", { name: "Dismiss message" }).click();
  await page.setViewportSize({ width: 1440, height: 1080 });

  const denied = await context.newPage();
  await denied.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await denied.goto(base);
  await denied
    .getByRole("button", { name: "Create call link", exact: true })
    .click();
  await denied
    .getByRole("alert")
    .filter({ hasText: "site settings" })
    .waitFor();
  assert.equal(
    await denied
      .getByRole("button", { name: "Create call link", exact: true })
      .isEnabled(),
    true,
    "Permission denial must allow retry",
  );
  await denied.close();

  const pending = await context.newPage();
  await pending.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      new Promise((resolve) => {
        window.resolveMedia = resolve;
      });
  });
  await pending.goto(base);
  await pending
    .getByRole("button", { name: "Create call link", exact: true })
    .click();
  await pending.getByRole("button", { name: "Cancel setup" }).click();
  await pending.evaluate(() => {
    window.mediaStopped = false;
    window.resolveMedia({
      getTracks: () => [
        {
          stop: () => {
            window.mediaStopped = true;
          },
        },
      ],
    });
  });
  await pending.waitForFunction(() => window.mediaStopped);
  await pending
    .getByRole("button", { name: "Create call link", exact: true })
    .waitFor();
  await pending.close();
  console.log(
    "PASS: responsive lobby, help, input validation, media consent, denied permissions, and cancelled setup.",
  );

  if (process.env.LIVE_CALL_TEST === "1") {
    await page.getByLabel("Your name").fill("Ayush");
    await page
      .getByRole("button", { name: "Create call link", exact: true })
      .click();
    await page.getByLabel("Your call link").waitFor({ timeout: 25000 });
    for (const [width, height] of [
      [1280, 720],
      [390, 844],
      [320, 568],
      [667, 375],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await assertFits(`Ready preview fits on one page at ${width}×${height}`);
      if (width === 320)
        await page.screenshot({ path: "test-results/preview-small.png" });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/preview-ready-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 720 });
    let link = await page.getByLabel("Your call link").inputValue();
    await page
      .getByRole("button", { name: "Copy call link", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => navigator.clipboard.readText()),
      link,
    );
    await page
      .getByRole("button", { name: "Join a call", exact: true })
      .click();
    await page.getByLabel("Call link or code").fill(link);
    await page.getByRole("button", { name: "Join call", exact: true }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "your own call link" })
      .waitFor();
    await page.getByRole("button", { name: "Dismiss message" }).click();

    const guest = await context.newPage();
    await guest.addInitScript(() => {
      window.blockCallAudio = true;
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this.tagName === "AUDIO" && window.blockCallAudio)
          return Promise.reject(
            new DOMException("Playback needs a tap", "NotAllowedError"),
          );
        return play.call(this);
      };
    });
    await guest.goto(link);
    await guest.getByLabel("Your name").fill("Riya");
    await guest.getByRole("button", { name: "Join call", exact: true }).click();
    await page
      .getByRole("button", { name: "Accept call", exact: true })
      .waitFor({ timeout: 45000 });
    for (const [width, height] of [
      [320, 568],
      [667, 375],
    ]) {
      await page.setViewportSize({ width, height });
      await assertFits(`Incoming call fits at ${width}×${height}`);
    }
    await page.setViewportSize({ width: 1280, height: 720 });
    assert.equal(
      await page.locator("video").count(),
      1,
      "Incoming caller does not get media before acceptance",
    );
    await page.getByRole("button", { name: "Decline", exact: true }).click();
    await guest.getByRole("status").filter({ hasText: "declined" }).waitFor();
    await guest.getByRole("button", { name: "Join call", exact: true }).click();
    await page
      .getByRole("button", { name: "Accept call", exact: true })
      .click({ timeout: 45000 });
    await page.locator(".is-connected").waitFor({ timeout: 45000 });
    await guest.locator(".is-connected").waitFor({ timeout: 45000 });
    await guest.getByRole("button", { name: "Enable call audio" }).waitFor();
    await guest.evaluate(() => {
      window.blockCallAudio = false;
    });
    await guest.getByRole("button", { name: "Enable call audio" }).click();
    for (const tab of [page, guest]) {
      await tab.waitForFunction(() => {
        const audio = document.querySelector("audio");
        return (
          audio &&
          !audio.paused &&
          !audio.muted &&
          audio.volume > 0 &&
          audio.currentTime > 0
        );
      });
    }
    await measureRemoteAudio(page);
    await measureRemoteAudio(guest);
    await assertRemoteAudio(page, true);
    await assertRemoteAudio(guest, true);
    await page.waitForFunction(
      () => document.querySelector(".video-stage > video")?.currentTime > 0,
    );
    for (const [width, height] of [
      [1440, 900],
      [1280, 720],
      [390, 844],
      [844, 390],
      [320, 568],
      [667, 375],
    ]) {
      await page.setViewportSize({ width, height });
      await assertFits(
        `Connected call fits on one screen at ${width}×${height}`,
      );
      await page
        .getByRole("button", { name: "Open chat", exact: true })
        .click();
      await assertFits(`Call with chat fits at ${width}×${height}`);
      if (width === 320 || width === 667)
        await page.screenshot({ path: `test-results/chat-${width}.png` });
      await page
        .getByRole("button", { name: "Close chat", exact: true })
        .click();
      const leave = await page
        .getByRole("button", { name: "Leave call", exact: true })
        .boundingBox();
      assert.ok(
        leave.y >= 0 && leave.y + leave.height <= height,
        "Leave control stays visible",
      );
    }
    await page.screenshot({ path: "test-results/call-landscape.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/call-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 720 });
    assert.equal(
      await page.locator("#call-panel").isVisible(),
      false,
      "Chat stays out of the video by default",
    );
    await assertFrameColor(guest, ".video-stage > video", false);
    await page.getByRole("slider", { name: "Camera zoom" }).press("End");
    await assertFrameColor(page, ".self-preview video", true);
    await assertFrameColor(guest, ".video-stage > video", true);
    assert.equal(
      await guest
        .locator(".video-stage > video")
        .evaluate((video) => getComputedStyle(video).transform),
      "none",
      "The caller receives zoomed pixels without a CSS transform",
    );
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await assertFrameColor(guest, ".video-stage > video", false);
    for (const [width, height] of [
      [360, 640],
      [640, 360],
    ]) {
      await page.evaluate(
        ({ width, height }) => {
          window.cameraSource.canvas.width = width;
          window.cameraSource.canvas.height = height;
        },
        { width, height },
      );
      await guest.waitForFunction(
        ({ width, height }) => {
          const video = document.querySelector(".video-stage > video");
          return (
            Math.abs(video.videoWidth / video.videoHeight - width / height) <
            0.03
          );
        },
        { width, height },
      );
      await assertFrameColor(guest, ".video-stage > video", false);
      await assertRemoteAudio(guest, true);
    }
    await page.getByRole("button", { name: "Enlarge your preview" }).click();
    await page.locator(".self-preview-large").waitFor();
    await page.getByRole("button", { name: "Hide self view" }).click();
    assert.equal(await page.locator(".self-preview").isVisible(), false);
    await page.getByRole("button", { name: "Show self view" }).click();
    await page.getByRole("button", { name: "Shrink your preview" }).click();
    await page.bringToFront();
    await page.getByRole("button", { name: "Enter fullscreen" }).click();
    await page.getByRole("button", { name: "Exit fullscreen" }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Leave call", exact: true })
        .isVisible(),
      true,
    );
    await page.getByRole("button", { name: "Exit fullscreen" }).click();

    await page.getByRole("button", { name: "Open chat", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Hello Riya! <b>Plain text</b>");
    await page.getByRole("button", { name: "Send message" }).click();
    await guest.locator(".unread-count").waitFor();
    await guest.getByRole("button", { name: "Open chat", exact: true }).click();
    await guest
      .getByRole("log")
      .getByText("Hello Riya! <b>Plain text</b>", { exact: true })
      .waitFor();
    await guest
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Hello Ayush!");
    await guest.getByRole("button", { name: "Send message" }).click();
    await page
      .getByRole("log")
      .getByText("Hello Ayush!", { exact: true })
      .waitFor();

    await page.bringToFront();
    await page.keyboard.press("Alt+KeyM");
    await page
      .getByRole("button", { name: "Unmute microphone", exact: true })
      .waitFor();
    await assertRemoteAudio(guest, false);
    await page.getByRole("button", { name: "Devices", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("meter").value < 0.01,
    );
    await page.evaluate(() => {
      window.oldMic = document
        .querySelector("video.mirrored")
        .srcObject.getAudioTracks()[0];
    });
    const micId = await page
      .getByLabel("Microphone", { exact: true })
      .locator("option")
      .nth(1)
      .getAttribute("value");
    await page.getByLabel("Microphone", { exact: true }).selectOption(micId);
    await page.waitForFunction(() => window.oldMic.readyState === "ended");
    await assertMusicInput();
    assert.equal(
      await page
        .locator("video.mirrored")
        .evaluate((video) => video.srcObject.getAudioTracks()[0].enabled),
      false,
      "Switching devices preserves mute",
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page.keyboard.press("Alt+KeyM");

    await page.getByRole("slider", { name: "Camera zoom" }).press("End");
    await page
      .getByRole("button", { name: "Turn camera off", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() => window.cameraSource.track.enabled),
      false,
      "Turning the camera off also disables the capture source",
    );
    await assertRemoteAudio(guest, true);
    await page.getByRole("button", { name: "Devices", exact: true }).click();
    await page.evaluate(() => {
      window.oldCamera = window.cameraSource.track;
      window.oldVideoOutput = document
        .querySelector("video.mirrored")
        .srcObject.getVideoTracks()[0];
    });
    const cameraId = await page
      .getByLabel("Camera", { exact: true })
      .locator("option")
      .nth(1)
      .getAttribute("value");
    await page.getByLabel("Camera", { exact: true }).selectOption(cameraId);
    await page.waitForFunction(
      () =>
        window.oldCamera.readyState === "ended" &&
        window.oldVideoOutput.readyState === "ended",
    );
    assert.equal(
      await page.evaluate(() => window.cameraSource.track.enabled),
      false,
      "Changing cameras preserves camera-off state",
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await page
      .getByRole("button", { name: "Turn camera on", exact: true })
      .click();
    await assertFrameColor(guest, ".video-stage > video", true);
    await assertRemoteAudio(guest, true);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("button", { name: "Devices", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("meter").value > 0.01,
    );
    await page.getByRole("button", { name: "Done", exact: true }).click();

    // Only synthetic display content; never open the system screen picker in tests.
    await page.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#265d43";
        ctx.fillRect(0, 0, 1280, 720);
        ctx.strokeStyle = "#e1edc8";
        ctx.lineWidth = 16;
        ctx.strokeRect(8, 8, 1264, 704);
        ctx.fillStyle = "white";
        ctx.font = "48px sans-serif";
        ctx.fillText("Shared screen — full frame", 80, 180);
        window.testScreen = canvas.captureStream(5);
        const track = window.testScreen.getVideoTracks()[0];
        const timer = setInterval(() => {
          if (track.readyState === "ended") return clearInterval(timer);
          ctx.fillStyle = "#265d43";
          ctx.fillRect(80, 220, 700, 60);
          ctx.fillStyle = "white";
          ctx.fillText(`Frame ${Date.now()}`, 80, 265);
        }, 200);
        return window.testScreen;
      };
    });
    await page
      .getByRole("button", { name: "Share screen", exact: true })
      .click();
    await guest
      .getByLabel("Shared screen", { exact: true })
      .waitFor({ timeout: 25000 });
    await guest.waitForFunction(
      () => document.querySelector(".screen-video")?.videoWidth > 0,
    );
    assert.equal(
      await guest
        .getByLabel("Shared screen", { exact: true })
        .evaluate((video) => getComputedStyle(video).objectFit),
      "contain",
    );
    await guest.screenshot({ path: "test-results/screen-sharing.png" });
    await assertRemoteAudio(guest, true);
    await page
      .getByRole("button", { name: "Stop sharing", exact: true })
      .click();
    await guest
      .getByLabel("Shared screen", { exact: true })
      .waitFor({ state: "detached" });
    assert.ok(
      await page.evaluate(() =>
        window.testScreen
          .getTracks()
          .every((track) => track.readyState === "ended"),
      ),
    );
    await page
      .getByRole("button", { name: "Share screen", exact: true })
      .click();
    await guest.getByLabel("Shared screen", { exact: true }).waitFor();
    await page.evaluate(() => {
      const track = window.testScreen.getVideoTracks()[0];
      track.stop();
      track.dispatchEvent(new Event("ended"));
    });
    await guest
      .getByLabel("Shared screen", { exact: true })
      .waitFor({ state: "detached" });
    assert.equal(
      await page
        .getByText("Call declined. Your link is still ready to share.")
        .isVisible(),
      false,
      "Old call messages are cleared for the next conversation",
    );
    await page
      .getByRole("button", { name: "Mute microphone", exact: true })
      .click();
    assert.equal(
      await page
        .locator("video.mirrored")
        .evaluate((video) => video.srcObject.getAudioTracks()[0].enabled),
      false,
    );
    await page
      .getByRole("button", { name: "Turn camera off", exact: true })
      .click();
    await guest.getByText("Here with you, audio only.").waitFor();
    await page.screenshot({
      path: "test-results/connected.png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Share screen", exact: true })
      .click();
    await guest.getByLabel("Shared screen", { exact: true }).waitFor();
    await page.evaluate(() => {
      window.previousTracks = document
        .querySelector("video.mirrored")
        .srcObject.getTracks();
    });
    await guest.evaluate(() => {
      window.previousTracks = document
        .querySelector("video.mirrored")
        .srcObject.getTracks();
    });
    await page.getByRole("button", { name: "Leave call", exact: true }).click();
    assert.ok(
      await page.evaluate(() =>
        window.capturedSources.every((stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
        ),
      ),
      "Leaving stops the physical microphone and source camera too",
    );
    assert.ok(
      await page.evaluate(() =>
        window.testScreen
          .getTracks()
          .every((track) => track.readyState === "ended"),
      ),
      "Leaving also stops screen capture",
    );
    await guest.getByRole("status").filter({ hasText: "left" }).waitFor();
    assert.ok(
      await page.evaluate(() =>
        window.previousTracks.every((track) => track.readyState === "ended"),
      ),
    );
    assert.ok(
      await guest.evaluate(() =>
        window.previousTracks.every((track) => track.readyState === "ended"),
      ),
    );

    await guest.getByRole("button", { name: "Join call", exact: true }).click();
    await guest
      .getByRole("alert")
      .filter({ hasText: "no longer available" })
      .waitFor({ timeout: 20000 });

    await page
      .getByRole("button", { name: "Create a call", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create call link", exact: true })
      .click();
    await page.getByLabel("Your call link").waitFor({ timeout: 25000 });
    const nextLink = await page.getByLabel("Your call link").inputValue();
    assert.notEqual(nextLink, link, "Fresh session has a fresh link");
    await guest.getByLabel("Call link or code").fill(nextLink);
    await guest.getByRole("button", { name: "Join call", exact: true }).click();
    await page
      .getByRole("button", { name: "Accept call", exact: true })
      .click({ timeout: 45000 });
    await page.locator(".is-connected").waitFor({ timeout: 45000 });
    await page.getByRole("button", { name: "Open chat", exact: true }).click();
    assert.equal(
      await page
        .getByRole("log")
        .getByText("Hello Ayush!", { exact: true })
        .count(),
      0,
      "Chat is cleared between calls",
    );
    await guest.getByText("Here with you, audio only.").waitFor();
    await guest
      .getByRole("button", { name: "Leave call", exact: true })
      .click();
    await page.getByRole("status").filter({ hasText: "left" }).waitFor();
    await guest.close();
    console.log(
      "PASS: real two-tab WebRTC call, copy, self-call guard, decline/retry, remote device state, hangup cleanup, expired link, second call, and audio-only mode.",
    );
  }
  assert.deepEqual(errors, [], "No uncaught browser errors");
} catch (error) {
  await page.screenshot({ path: "test-results/failure.png", fullPage: true });
  console.error({ url: page.url(), errors, title: await page.title() });
  throw error;
} finally {
  await browser.close();
}
