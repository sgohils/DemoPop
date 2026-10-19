import { chromium, type Browser, type Page } from "playwright-core";
import { ensureBrowser } from "@remotion/renderer";
import sharp from "sharp";
import { publicWebResponse, publicWebUrl } from "./public-web";

export type WebsiteImport = {
  url: string;
  name: string;
  opening: string;
  color: string;
  font: "dm-sans" | "manrope";
  cta: string;
  description?: string;
  sections?: { heading: string; summary: string }[];
  captures: { name: string; caption: string; image: string }[];
  logo: string | null;
};
const short = (text: string, max: number) => {
  const copy = text
    .replace(/[\u200b\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (copy.length <= max) return copy;
  let part = "";
  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(copy)) {
    if (part.length + segment.length > max) break;
    part += segment;
  }
  const wordEnd = part.lastIndexOf(" ");
  return wordEnd > max * 0.65 ? part.slice(0, wordEnd) : part;
};
type WebsiteMetadata = {
  siteName: string;
  title: string;
  h1: string;
  description: string;
  headings: { text: string; summary: string; y: number }[];
  cta: string;
  colors: string[];
  font: string;
};

// Keep generated copy grounded in the page. Truncation is at word boundaries,
// and fallback text describes the website rather than inventing product claims.
export function websiteCopy(metadata: WebsiteMetadata, hostname: string) {
  const titleName = metadata.title.split(
    /\s*[|\u2013\u2014]\s*|:\s+|\s+-\s+/,
  )[0];
  const name = short(
    metadata.siteName || titleName || hostname.replace(/^www\./, ""),
    60,
  );
  const description = short(metadata.description, 280);
  const opening = short(metadata.h1 || description || `Explore ${name}.`, 70);
  const sections = metadata.headings
    .filter(
      (heading, index, all) =>
        heading.text &&
        all.findIndex(
          (item) => item.text.toLowerCase() === heading.text.toLowerCase(),
        ) === index,
    )
    .map((heading) => ({
      heading: short(heading.text, 70),
      summary: short(heading.summary, 180),
    }));
  return {
    name,
    opening,
    description,
    sections,
    cta: short(metadata.cta || `Explore ${name}.`, 36),
  };
}

async function settleVisibleAssets(page: Page, timeout = 1800) {
  await page
    .waitForFunction(
      () => {
        return [...document.images].every((image) => {
          const box = image.getBoundingClientRect();
          return (
            box.bottom <= 0 ||
            box.top >= innerHeight ||
            box.right <= 0 ||
            box.left >= innerWidth ||
            !box.width ||
            !box.height ||
            image.complete
          );
        });
      },
      undefined,
      { timeout },
    )
    .catch(() => {});
  // Let lazy image decodes and scroll-triggered layout updates reach a frame.
  await page.waitForTimeout(180);
}

async function settleEntranceAnimations(page: Page) {
  const ready = await page
    .waitForFunction(
      () => {
        const heading = [...document.querySelectorAll("h1")].find(
          (element) =>
            element.getBoundingClientRect().height > 0 &&
            !element.closest("nav,footer"),
        );
        if (!heading) return true;
        const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          if (!walker.currentNode.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(walker.currentNode);
          const box = range.getBoundingClientRect();
          if (
            box.width < 12 ||
            box.height < 12 ||
            box.right <= 0 ||
            box.left >= innerWidth ||
            box.bottom <= 0 ||
            box.top >= innerHeight
          )
            continue;
          let element = walker.currentNode.parentElement;
          let visible = true;
          while (element && element !== document.body) {
            const style = getComputedStyle(element);
            const bounds = element.getBoundingClientRect();
            if (
              Number(style.opacity) < 0.05 ||
              style.visibility === "hidden" ||
              style.display === "none" ||
              bounds.width < 3 ||
              bounds.height < 3 ||
              (style.clip !== "auto" && style.clip !== "")
            )
              visible = false;
            element = element.parentElement;
          }
          if (visible) return true;
        }
        return false;
      },
      undefined,
      { timeout: 2500 },
    )
    .then(() => true)
    .catch(() => false);
  if (ready) return;
  // Some sites leave server-rendered entrance elements at opacity:0 when a
  // nonessential animation bundle fails. Reveal only positioned inline-opacity
  // content already in this viewport; keep hidden menus and dialogs untouched.
  await page.evaluate(() => {
    for (const element of [
      ...document.querySelectorAll<HTMLElement>(
        "main [style],article [style],h1 [style]",
      ),
    ].slice(0, 1500)) {
      const box = element.getBoundingClientRect();
      if (
        box.width < 12 ||
        box.height < 12 ||
        box.bottom <= 0 ||
        box.top >= innerHeight ||
        !element.style.opacity ||
        Number(element.style.opacity) !== 0 ||
        element.closest('nav,aside,[hidden],[role="dialog"],[role="menu"]')
      )
        continue;
      element.style.setProperty("opacity", "1", "important");
      element.style.setProperty("transform", "none", "important");
      element.style.setProperty("filter", "none", "important");
    }
  });
}

export async function captureWebsite(value: string): Promise<WebsiteImport> {
  const url = publicWebUrl(value);
  let browser: Browser | undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
    void browser?.close().catch(() => {});
  }, 35000);
  try {
    // Resolve the first document before opening Chromium, then revalidate and pin
    // every browser subrequest, including redirects and third-party media.
    const initial = await publicWebResponse(url.toString(), controller.signal);
    if (initial.status >= 400)
      throw new Error(
        "The website could not be opened. Try another public page.",
      );
    if (
      /^(?:image\/|video\/|audio\/|application\/pdf)/i.test(
        initial.headers["content-type"] || "",
      )
    )
      throw new Error(
        "The website link must open a webpage, rather than an image or document.",
      );
    const executable = await ensureBrowser();
    if (!("path" in executable))
      throw new Error("Website capture needs the server's Chromium browser.");
    if (controller.signal.aborted)
      throw new Error("Website capture timed out.");
    browser = await chromium.launch({
      executablePath: executable.path,
      headless: true,
      chromiumSandbox: true,
      env: Object.fromEntries(
        [
          "PATH",
          "Path",
          "SystemRoot",
          "SYSTEMROOT",
          "WINDIR",
          "TEMP",
          "TMP",
          "USERPROFILE",
          "LOCALAPPDATA",
          "APPDATA",
          "HOME",
          "LANG",
          "LC_ALL",
          "DISPLAY",
          "XDG_RUNTIME_DIR",
        ].flatMap((key) =>
          process.env[key] ? [[key, process.env[key]!]] : [],
        ),
      ),
      // Browser traffic must go through our validated/pinned request fulfillment.
      // Any unsupported native transport fails against a closed loopback proxy.
      proxy: { server: "http://127.0.0.1:9" },
      args: [
        "--proxy-bypass-list=<-loopback>",
        "--disable-quic",
        "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      ],
    });
    if (controller.signal.aborted)
      throw new Error("Website capture timed out.");
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
      serviceWorkers: "block",
      acceptDownloads: false,
      javaScriptEnabled: true,
    });
    let requests = 0,
      bytes = 0;
    let initialDocument = true;
    let activeRequests = 0;
    const waitingRequests: (() => void)[] = [];
    await context.routeWebSocket(/.*/, (route) => route.close());
    await context.route("**/*", async (route) => {
      const request = route.request();
      if (
        ++requests > 500 ||
        bytes >= 40 * 1024 * 1024 ||
        request.method() !== "GET" ||
        request.resourceType() === "media"
      ) {
        await route.abort().catch(() => {});
        return;
      }
      // Modern sites split hydration into hundreds of small bundles. Permit
      // those bundles, but bound concurrent buffers and the bytes actually
      // delivered to Chromium rather than multiplying the per-resource cap.
      if (activeRequests < 6) activeRequests++;
      else await new Promise<void>((resolve) => waitingRequests.push(resolve));
      try {
        if (controller.signal.aborted || bytes >= 40 * 1024 * 1024) {
          await route.abort().catch(() => {});
          return;
        }
        const result =
          initialDocument &&
          request.isNavigationRequest() &&
          request.url() === url.toString()
            ? initial
            : await publicWebResponse(request.url(), controller.signal);
        if (request.isNavigationRequest()) initialDocument = false;
        if (bytes + result.body.length > 40 * 1024 * 1024) {
          await route.abort().catch(() => {});
          return;
        }
        bytes += result.body.length;
        await route.fulfill({
          status: result.status,
          headers: result.headers,
          body: result.body,
        });
      } catch {
        await route.abort().catch(() => {});
      } finally {
        const next = waitingRequests.shift();
        if (next) next();
        else activeRequests--;
      }
    });
    const page = await context.newPage();
    const response = await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    if (!response || response.status() >= 400)
      throw new Error(
        "The site blocks automated capture. Upload screenshots instead.",
      );
    // Server-rendered pages can still be hidden until their client bundle
    // starts the entrance animation. Give those scripts a bounded settling
    // period; persistent analytics and streaming requests cannot stall capture.
    await page
      .waitForLoadState("networkidle", { timeout: 3000 })
      .catch(() => {});
    await page.evaluate(() =>
      Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 1800)),
      ]),
    );
    await page.addStyleTag({
      content:
        "html{scroll-behavior:auto!important} *,*::before,*::after{transition:none!important;caret-color:transparent!important} iframe,video:not([poster]){visibility:hidden!important} [data-demopop-capture-overlay]{visibility:hidden!important}",
    });
    // Only dismiss visible, explicitly labelled consent buttons; don't click CTAs.
    const consent = page
      .getByRole("button", {
        name: /^(reject all|reject cookies|only necessary|necessary only|accept all|accept cookies)$/i,
      })
      .first();
    if (await consent.isVisible().catch(() => false))
      await consent.click({ timeout: 1000 }).catch(() => {});
    await settleVisibleAssets(page);
    await settleEntranceAnimations(page);
    const metadata = await page.evaluate(() => {
      const headings = [...document.querySelectorAll("h2,h3")]
        .slice(0, 150)
        .filter((element) => {
          const box = element.getBoundingClientRect();
          const text =
            (element as HTMLElement).innerText?.replace(/\s+/g, " ").trim() ||
            "";
          return (
            !element.closest('nav,header,footer,aside,[aria-hidden="true"]') &&
            box.width > 100 &&
            box.height > 0 &&
            getComputedStyle(element).visibility !== "hidden" &&
            parseFloat(getComputedStyle(element).fontSize) >= 22 &&
            text.length >= 4 &&
            text.length <= 140 &&
            !/^(?:frequently asked|faq|cookie|privacy|terms|sign up|log in|sign in|navigation|menu|newsletter|related (?:posts|articles))/i.test(
              text,
            )
          );
        })
        .slice(0, 8)
        .map((element) => ({
          text:
            (element as HTMLElement).innerText?.replace(/\s+/g, " ").trim() ||
            "",
          summary:
            (element.nextElementSibling?.matches("p")
              ? element.nextElementSibling.textContent
              : element.parentElement?.querySelector("p")?.textContent
            )
              ?.replace(/\s+/g, " ")
              .trim()
              .slice(0, 350) || "",
          y: element.getBoundingClientRect().top + window.scrollY,
        }));
      const buttons = [...document.querySelectorAll("a,button")].filter(
        (element) => {
          const box = element.getBoundingClientRect();
          const text = element.textContent?.replace(/\s+/g, " ").trim() || "";
          return (
            box.height > 0 &&
            box.width > 0 &&
            box.top < innerHeight &&
            !element.closest('footer,[aria-hidden="true"]') &&
            getComputedStyle(element).visibility !== "hidden" &&
            text.length <= 60 &&
            /^(?:(?:get|let.s get) started|start (?:free|now|your|a)|try (?:it|free|now)|book (?:a |your )?demo|request (?:a )?demo|contact (?:us|sales)|explore|shop (?:now|the)|buy (?:now|the)|download|join|sign up)/i.test(
              text,
            ) &&
            !/cookie|consent|privacy/i.test(text)
          );
        },
      );
      const button =
        buttons.find((element) => !element.closest("nav,header")) || buttons[0];
      const styles = button ? getComputedStyle(button) : null;
      const headline = [...document.querySelectorAll("h1")].find(
        (element) =>
          element.getBoundingClientRect().height > 0 &&
          !element.closest('nav,footer,[aria-hidden="true"]') &&
          getComputedStyle(element).visibility !== "hidden",
      );
      const semanticHeadline = headline?.cloneNode(true) as
        HTMLElement | undefined;
      semanticHeadline
        ?.querySelectorAll('[aria-hidden="true"],[hidden],script,style')
        .forEach((element) => element.remove());
      const brand = document.querySelector<HTMLMetaElement>(
        'meta[name="theme-color"]',
      )?.content;
      const colors = [
        brand || "",
        styles?.backgroundColor || "",
        styles?.color || "",
      ];
      return {
        siteName:
          document.querySelector<HTMLMetaElement>(
            'meta[property="og:site_name"]',
          )?.content ||
          document.querySelector<HTMLMetaElement>(
            'meta[name="application-name"]',
          )?.content ||
          "",
        title: document.title,
        h1: (
          headline?.getAttribute("aria-label") ||
          semanticHeadline?.textContent ||
          headline?.innerText ||
          ""
        )
          .replace(/\s+/g, " ")
          .trim(),
        description:
          document.querySelector<HTMLMetaElement>('meta[name="description"]')
            ?.content ||
          document.querySelector<HTMLMetaElement>(
            'meta[property="og:description"]',
          )?.content ||
          "",
        headings,
        cta: button?.textContent?.trim() || "",
        colors,
        font: getComputedStyle(document.body).fontFamily,
      };
    });
    if (
      /^(?:just a moment|access denied|attention required|checking your browser|verify (?:you|that you)|page not found|404\b)/i.test(
        metadata.h1 || metadata.title,
      )
    )
      throw new Error(
        "The site blocks automated capture. Try another public page.",
      );
    const copy = websiteCopy(metadata, url.hostname);
    const png = async () =>
      `data:image/png;base64,${(await page.screenshot({ type: "png", animations: "disabled", timeout: 5000 })).toString("base64")}`;
    const hero = await png();
    const feature =
      metadata.headings.find((heading) => heading.y > 650) ??
      metadata.headings[0];
    await page.evaluate(
      (y) => scrollTo(0, y),
      Math.max(0, (feature?.y ?? 850) - 100),
    );
    await settleVisibleAssets(page);
    // Navigation and consent overlays should not cover a detail scene. Mark
    // only viewport overlays, then restore them before capturing mobile.
    await page.evaluate(() => {
      for (const element of [
        ...document.body.querySelectorAll<HTMLElement>("*"),
      ].slice(0, 2500)) {
        const style = getComputedStyle(element);
        if (style.position !== "fixed" && style.position !== "sticky") continue;
        const box = element.getBoundingClientRect();
        if (
          box.width > innerWidth * 0.55 &&
          box.height > 0 &&
          box.height < innerHeight * 0.4 &&
          (box.top < 180 || box.bottom > innerHeight - 180)
        )
          element.dataset.demopopCaptureOverlay = "true";
      }
    });
    const detail = await png();
    await page.evaluate(() => {
      for (const element of document.querySelectorAll<HTMLElement>(
        "[data-demopop-capture-overlay]",
      ))
        delete element.dataset.demopopCaptureOverlay;
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    await settleVisibleAssets(page);
    const mobile = await png();
    let logo: string | null = null;
    const brandLogo = page
      .locator(
        'header img:visible, nav img:visible, img[alt*="logo" i]:visible, header a[href="/"] svg:visible, nav a[href="/"] svg:visible, header svg[aria-label]:visible',
      )
      .first();
    const logoBox = (await brandLogo.count())
      ? await brandLogo.boundingBox().catch(() => null)
      : null;
    if (
      logoBox &&
      logoBox.width <= 800 &&
      logoBox.height <= 400 &&
      logoBox.width >= 16 &&
      logoBox.height >= 12
    ) {
      const bytes = await brandLogo
        .screenshot({ type: "png", timeout: 2000 })
        .catch(() => null);
      if (bytes)
        logo = `data:image/png;base64,${(
          await sharp(bytes)
            .extend({
              top: Math.max(0, Math.ceil((64 - logoBox.height) / 2)),
              bottom: Math.max(0, Math.ceil((64 - logoBox.height) / 2)),
              left: Math.max(0, Math.ceil((64 - logoBox.width) / 2)),
              right: Math.max(0, Math.ceil((64 - logoBox.width) / 2)),
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer()
        ).toString("base64")}`;
    }
    let color = "#365DDB";
    for (const candidate of metadata.colors) {
      const hex = candidate.match(/^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/)?.[1];
      if (hex) {
        const full =
          hex.length === 3
            ? hex
                .split("")
                .map((character) => character + character)
                .join("")
            : hex;
        const channels = [0, 2, 4].map((offset) =>
          parseInt(full.slice(offset, offset + 2), 16),
        );
        if (Math.max(...channels) - Math.min(...channels) > 35) {
          color = `#${full}`;
          break;
        }
      }
      const rgb = candidate.match(/^rgba?\((\d+),?\s*(\d+),?\s*(\d+)/);
      if (rgb) {
        const channels = rgb.slice(1).map(Number);
        if (Math.max(...channels) - Math.min(...channels) > 35) {
          color = `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
          break;
        }
      }
    }
    return {
      url: page.url(),
      ...copy,
      color,
      font: /manrope/i.test(metadata.font) ? "manrope" : "dm-sans",
      captures: [
        {
          name: "Desktop introduction",
          caption: copy.opening,
          image: hero,
        },
        {
          name: "Feature detail",
          caption: short(
            feature?.text || copy.description || `Explore ${copy.name}.`,
            70,
          ),
          image: detail,
        },
        {
          name: "Mobile experience",
          caption: short(`${copy.name}, on mobile.`, 70),
          image: mobile,
        },
      ],
      logo,
    };
  } catch (error) {
    if (error instanceof Error && /^(The site|The website)/.test(error.message))
      throw error;
    throw new Error(
      "Website capture could not finish. Try another public page or upload screenshots.",
      { cause: error },
    );
  } finally {
    clearTimeout(timeout);
    controller.abort();
    await browser?.close().catch(() => {});
  }
}
