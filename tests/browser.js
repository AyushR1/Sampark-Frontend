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
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `No overflow at ${width}px`,
    );
  }
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
    assert.equal(
      await page.getByText("Call declined. Your link is still ready to share.").isVisible(),
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
} finally {
  await browser.close();
}
