import { aisdk } from "@openai/agents-extensions";
import { google } from "@ai-sdk/google";
import { Agent, run, tool } from "@openai/agents";
import { chromium } from "playwright";
import { z } from "zod";
import "dotenv/config";

// Global state -> TODO: Create a wrapper class for browser action
let browser, page;
const VIEWPORT_WIDTH = 920;
const VIEWPORT_HIGHT = 920;

async function initializeBrowser() {
  console.log("[DEBUG] Launching browser...");
  browser = await chromium.launch({
    headless: false,
    slowMo: 1000,
  });

  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HIGHT },
  });

  page = await context.newPage();

  // Add error handling
  page.on("console", (msg) => console.log(`[BROWSER] ${msg.text()}`));
  page.on("pageerror", (error) => console.log(`[ERROR] ${error.message}`));

  console.log("[DEBUG] Browser initialized with 800x520 viewport");
}

// Take screenshot
const screenshotTool = tool({
  name: "take_screenshot",
  description: "Capture viewport screenshot and get visible interactive elements",
  parameters: z.object({
    maxElements: z.number().describe("max elements to return").optional().nullable(),
    quality: z.number().describe("jpeg quality 1-100").optional().nullable(),
  }),
  execute: async (input) => {
    const quality = input.quality || 40;
    const maxElements = input.maxElements || 8;

    console.log(`[DEBUG] Taking screenshot`);

    const screenshot = await page.screenshot({
      fullPage: false,
      type: "jpeg",
      quality: quality,
      clip: { x: 0, y: 0, width: VIEWPORT_WIDTH, height: VIEWPORT_HIGHT },
    });

    // Get ALL visible interactive elements
    const elements = await page.evaluate((maxElements) => {
      function isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);

        return (
          rect.width > 8 &&
          rect.height > 8 &&
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          !element.disabled &&
          !element.readOnly
        );
      }

      // One comprehensive selector - covers everything
      const allInteractive = document.querySelectorAll(`
        button, 
        input:not([type="hidden"]), 
        textarea, 
        select, 
        a[href], 
        [role="button"],
        [onclick],
        [tabindex]:not([tabindex="-1"])
      `);

      return Array.from(allInteractive)
        .filter(isElementVisible)
        .slice(0, maxElements)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            type: element.type || "",
            id: element.id || "",
            text: (element.textContent || element.placeholder || "").trim().slice(0, 30),
            selector: element.id
              ? `#${element.id}`
              : element.className
              ? `.${element.className.split(" ")[0]}`
              : element.tagName.toLowerCase(),
            coordinates: {
              x: Math.round(rect.left + rect.width / 2),
              y: Math.round(rect.top + rect.height / 2),
            },
          };
        });
    }, maxElements);

    console.log(`[DEBUG] Found ${elements.length} interactive elements`);

    return {
      screenshot: screenshot.toString("base64"),
      elements,
      elementCount: elements.length,
      message: `Screenshot with ${elements.length} interactive elements`,
    };
  },
});

// Smart click tool with DOM-first, coordinate fallback
const smartClickTool = tool({
  name: "smart_click",
  description: "Click element using hybrid approach",
  parameters: z.object({
    selector: z.string().describe("CSS selector").optional().nullable(),
    text: z.string().describe("element text content").optional().nullable(),
    x: z.number().describe("x coordinate").optional().nullable(),
    y: z.number().describe("y coordinate").optional().nullable(),
    waitTime: z.number().describe("wait timeout ms").optional().nullable(),
  }),
  execute: async (input) => {
    const waitTime = input.waitTime || 3000;

    // Strategy 1: CSS Selector
    if (input.selector) {
      console.log(`[DEBUG] Trying click with selector: ${input.selector}`);
      try {
        await page.waitForSelector(input.selector, { timeout: waitTime });
        await page.click(input.selector);
        console.log(`[SUCCESS] Clicked using selector: ${input.selector}`);
        return `Clicked successfully using selector: ${input.selector}`;
      } catch (error) {
        console.log(`[FAILED] Selector click failed: ${error.message}`);
      }
    }

    // Strategy 2: Text Content
    if (input.text) {
      console.log(`[DEBUG] Trying click with text: ${input.text}`);
      try {
        await page.locator(`text="${input.text}"`).first().click();
        console.log(`[SUCCESS] Clicked using text: ${input.text}`);
        return `Clicked successfully using text: ${input.text}`;
      } catch (error) {
        console.log(`[FAILED] Text click failed: ${error.message}`);
      }
    }

    // Strategy 3: Coordinate Fallback
    if (input.x && input.y) {
      console.log(`[DEBUG] Trying click with coordinates: (${input.x}, ${input.y})`);
      try {
        await page.mouse.click(input.x, input.y);
        console.log(`[SUCCESS] Clicked using coordinates: (${input.x}, ${input.y})`);
        return `Clicked successfully using coordinates: (${input.x}, ${input.y})`;
      } catch (error) {
        console.log(`[FAILED] Coordinate click failed: ${error.message}`);
        return `All click strategies failed. Last error: ${error.message}`;
      }
    }

    return "No valid click parameters provided";
  },
});

// Smart typing tool
const smartTypeTool = tool({
  name: "smart_type",
  description: "Type text into specified field or active element with optional typing effect",
  parameters: z.object({
    selector: z.string().describe("CSS selector of input field").optional().nullable(),
    text: z.string().describe("Text to type").optional().nullable(),
    clearFirst: z.boolean().describe("Clear field before typing").optional().nullable(),
    typingDelay: z.number().describe("Delay in ms between keystrokes").optional().nullable(), // 👈 Added
  }),
  execute: async (input) => {
    const text = input.text || "";
    const clearFirst = input.clearFirst !== false; // Default true
    const delay = input.typingDelay ?? 50; // Default: 50ms per keystroke

    console.log(`[DEBUG] Typing "${text}" into ${input.selector || "active element"} with delay ${delay}ms`);

    try {
      if (input.selector) {
        await page.waitForSelector(input.selector, { timeout: 3000 });

        if (clearFirst) {
          await page.fill(input.selector, ""); // Clear field
        }

        // Use page.type() with delay to simulate typing effect
        await page.type(input.selector, text, { delay });
        console.log(`[SUCCESS] Typed "${text}" into ${input.selector} with delay ${delay}ms`);
        return `Successfully typed "${text}" into ${input.selector} with delay ${delay}ms`;
      } else {
        // Active element typing
        await page.keyboard.type(text, { delay });
        console.log(`[SUCCESS] Typed "${text}" into active element with delay ${delay}ms`);
        return `Successfully typed "${text}" into active element with delay ${delay}ms`;
      }
    } catch (error) {
      console.log(`[FAILED] Typing failed: ${error.message}`);
      return `Typing failed: ${error.message}`;
    }
  },
});

// Smart Scroll
const smartScrollTool = tool({
  name: "smart_scroll",
  description: "Scroll the page up, down, left, or right",
  parameters: z.object({
    direction: z.enum(["up", "down", "left", "right"]).describe("scroll direction").optional().nullable(),
    amount: z.number().describe("pixels to scroll").optional().nullable(),
    smooth: z.boolean().describe("smooth scrolling").optional().nullable(),
  }),
  execute: async (input) => {
    const direction = input.direction || "down";
    const amount = input.amount || 300;
    const smooth = input.smooth !== false; // Default true

    console.log(`[DEBUG] Scrolling ${direction} by ${amount}px ${smooth ? "(smooth)" : "(instant)"}`);

    try {
      if (smooth) {
        // Smooth scroll using JavaScript
        const scrollMap = {
          up: [0, -amount],
          down: [0, amount],
          left: [-amount, 0],
          right: [amount, 0],
        };

        const [deltaX, deltaY] = scrollMap[direction];
        await page.evaluate(
          ([dx, dy]) => {
            window.scrollBy({ left: dx, top: dy, behavior: "smooth" });
          },
          [deltaX, deltaY]
        );

        // Wait for smooth scroll to complete
        await page.waitForTimeout(500);
      } else {
        // Instant scroll using mouse wheel
        const deltaX = direction === "left" ? -amount : direction === "right" ? amount : 0;
        const deltaY = direction === "up" ? -amount : direction === "down" ? amount : 0;

        await page.mouse.wheel(deltaX, deltaY);
      }

      console.log(`[SUCCESS] Scrolled ${direction} by ${amount}px`);
      return `Successfully scrolled ${direction} by ${amount}px`;
    } catch (error) {
      console.log(`[ERROR] Scroll failed: ${error.message}`);
      return `Scroll failed: ${error.message}`;
    }
  },
});

// Navigation tool
const navigateTool = tool({
  name: "navigate",
  description: "Navigate to specified URL or use shortcut like chaicode, amazon, google",
  parameters: z.object({
    url: z.string().describe("full URL or shortcut name").optional().nullable(),
  }),
  execute: async (input) => {
    // Smart URL shortcuts for common sites - TODO: remove this
    const shortcuts = {
      chaicode: "https://ui.chaicode.com",
      amazon: "https://amazon.com",
      google: "https://google.com",
      form: "https://httpbin.org/forms/post",
      login: "https://the-internet.herokuapp.com/login",
      todo: "https://todomvc.com/examples/vanilla-es6/",
      calculator: "https://calculator.net/",
      search: "https://duckduckgo.com/",
    };

    const finalUrl = shortcuts[input.url] || input.url;

    console.log(`[DEBUG] Navigating to: ${finalUrl}`);

    try {
      await page.goto(finalUrl, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });

      // Get page info
      const title = await page.title();
      console.log(`[SUCCESS] Navigation completed. Page title: ${title}`);

      return `Successfully navigated to ${title} (${finalUrl})`;
    } catch (error) {
      console.log(`[FAILED] Navigation failed: ${error.message}`);
      return `Navigation failed: ${error.message}`;
    }
  },
});

const model = aisdk(google("gemini-2.0-flash"), {});
// Create the efficient agent
const efficientAgent = new Agent({
  model,
  name: "Efficient Browser Agent",
  instructions: `
You are an AI agent designed to operate in an iterative loop to automate browser tasks.
Your ultimate goal is to accomplish the task provided in <user_request>.

CAPABILITIES
You excel at:
1. Navigating complex websites and extracting precise information.
2. Automating form submissions and interactive web actions (always complete the form fully if present).
3. Gathering and saving information.
4. Operating effectively in an agent loop.
5. Efficiently performing diverse web tasks.

STRATEGY
1. Understand and improve user query before processing the task
1. Always begin with a viewport screenshot to understand the current state.
2. Use DOM selectors as the primary method (semantic and reliable).
3. Fall back to coordinate clicks if DOM-based methods fail.
4. Prioritize visible and interactive elements to minimize noise.

If a form is present, detect all required fields → fill them completely → scroll to check for extra fields → then submit.

WORKFLOW
1. Start with take_screenshot.
2. Use navigate if a URL is needed.
3. Use smart_click for interactions (tries DOM first, then coordinates).
4. Use smart_type for entering data into form fields.
5. Submit forms via the relevant button (e.g., Sign Up, Login, Search, Create Account).
6. Validate success via screenshot + success message.
7. Return with success message

BEST PRACTICES
- Be precise but concise in explaining each step.
- Always provide visual feedback with screenshots.
- Handle errors gracefully and retry with fallback methods.
- Stay efficient by avoiding irrelevant elements.

  `,
  tools: [screenshotTool, smartClickTool, smartTypeTool, navigateTool, smartScrollTool],
});

// Main execution function
async function runBrowserAutomation(task, initialSite = null) {
  await initializeBrowser();

  try {
    if (initialSite) {
      console.log(`[DEBUG] Starting with initial site: ${initialSite}`);
      await page.goto(finalUrl, { waitUntil: "domcontentloaded" });
    }

    console.log(`[DEBUG] Starting automation task: ${task}`);
    console.log("=".repeat(60));

    const result = await run(efficientAgent, task, {
      maxTurns: 20,
    });

    console.log("=".repeat(60));
    console.log(`[SUCCESS] Task completed successfully!`);
    console.log("Final result:", result.finalOutput);

    return result;
  } catch (error) {
    console.error(`[ERROR] Automation task failed: ${error.message}`);
    throw error;
  }
}

// Cleanup function
async function cleanup() {
  if (browser) {
    await browser.close();
    console.log("[DEBUG] Browser closed successfully");
  }
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

export { runBrowserAutomation, cleanup };
