import assert from "node:assert/strict";
import { chromium } from "playwright";

// Run against `npm run dev -- --host 127.0.0.1`. Uses synthetic media only.
const base = process.env.APP_URL || "http://127.0.0.1:5173";
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
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
    [1440, 900],
    [1366, 768],
    [1280, 720],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
      `Lobby fits on one page at ${width}×${height}`,
    );
  }
  await page.getByRole("button", { name: "Devices", exact: true }).click();
  await page.getByRole("dialog", { name: "Camera & audio" }).waitFor();
  await page.getByLabel("Microphone", { exact: true }).selectOption("");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page
    .getByRole("button", { name: "Enable camera & mic", exact: true })
    .click();
  const zoom = page.getByRole("slider", { name: "Zoom your preview" });
  await zoom.waitFor();
  await assertMusicInput();
  assert.equal(
    await page
      .locator("video.mirrored")
      .evaluate((video) => getComputedStyle(video).objectFit),
    "contain",
    "The full camera frame is visible at default zoom",
  );
  await zoom.press("End");
  assert.equal(await zoom.inputValue(), "3");
  assert.equal(
    await page
      .locator("video.mirrored")
      .evaluate((video) => getComputedStyle(video).transform),
    "matrix(-3, 0, 0, 3, 0, 0)",
  );
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
    ]) {
      await page.setViewportSize({ width, height });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
        `Ready preview fits on one page at ${width}×${height}`,
      );
    }
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
    await guest.goto(link);
    await guest.getByLabel("Your name").fill("Riya");
    await guest.getByRole("button", { name: "Join call", exact: true }).click();
    await page
      .getByRole("button", { name: "Accept call", exact: true })
      .waitFor({ timeout: 45000 });
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
    await page
      .getByRole("heading", { name: "You’re together." })
      .waitFor({ timeout: 45000 });
    await guest
      .getByRole("heading", { name: "You’re together." })
      .waitFor({ timeout: 45000 });
    await page.waitForFunction(
      () => document.querySelector(".video-stage > video")?.currentTime > 0,
    );
    for (const [width, height] of [
      [1440, 900],
      [1280, 720],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollHeight <= innerHeight,
        ),
        `Connected call fits on one screen at ${width}×${height}`,
      );
      const leave = await page
        .getByRole("button", { name: "Leave call", exact: true })
        .boundingBox();
      assert.ok(
        leave.y >= 0 && leave.y + leave.height <= height,
        "Leave control stays visible",
      );
    }
    await page.screenshot({ path: "test-results/call-mobile.png" });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("slider", { name: "Zoom your preview" }).press("End");
    assert.equal(
      await page
        .locator(".self-preview video")
        .evaluate((video) => getComputedStyle(video).transform),
      "matrix(-3, 0, 0, 3, 0, 0)",
    );
    assert.equal(
      await guest
        .locator(".video-stage > video")
        .evaluate((video) => getComputedStyle(video).transform),
      "none",
      "Zoom affects only the local preview",
    );
    await page.getByRole("button", { name: "Reset", exact: true }).click();
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

    await page
      .getByRole("textbox", { name: "Message", exact: true })
      .fill("Hello Riya! <b>Plain text</b>");
    await page.getByRole("button", { name: "Send message" }).click();
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
    await page.getByRole("button", { name: "Devices", exact: true }).click();
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
    await page
      .getByRole("heading", { name: "You’re together." })
      .waitFor({ timeout: 45000 });
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
