import { Command } from "commander";
import { api, msToIso } from "@moemail/core";
import { fail, printJson, printText } from "../output.js";

export function registerReadCommand(program: Command) {
  program
    .command("read")
    .description("Read an email message")
    .requiredOption("--email-id <id>", "email ID")
    .requiredOption("--message-id <id>", "message ID")
    .option("--format <format>", "text | html", "text")
    .action(async (opts) => {
      const json = program.opts().json;
      try {
        const data = (await api.getMessage(opts.emailId, opts.messageId)) as any;
        const msg = data.message;

        if (json) {
          printJson({
            id: msg.id,
            from: msg.sender,
            to: msg.recipient,
            subject: msg.subject,
            content: msg.text,
            html: msg.html,
            receivedAt: msg.receivedAt ? msToIso(msg.receivedAt) : null,
            type: msg.type,
          });
        } else {
          printText(`From: ${msg.sender}`);
          printText(`To: ${msg.recipient}`);
          printText(`Subject: ${msg.subject}`);
          printText(`---`);
          if (opts.format === "html") {
            printText(msg.html || "(no HTML content)");
          } else {
            printText(msg.text || "(no text content)");
          }
        }
      } catch (e) {
        fail(e);
      }
    });
}
