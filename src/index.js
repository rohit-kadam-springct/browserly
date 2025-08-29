import readline from "readline";
import { runBrowserAutomation } from "./core/browserAgent";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question(
  "\n💡 What would you like me to do for you?\n" +
    // "   (Example: 'signup on chaicode', 'login to gmail', 'search flights')\n\n" +
    "👉 Your request: ",
  async (userRequest) => {
    await runBrowserAutomation(userRequest);
    rl.close();
  }
);
