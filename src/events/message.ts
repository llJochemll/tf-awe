import type { ArgsOf } from "discordx";
import { Discord, On, Client } from "discordx";

@Discord()
export abstract class MessageEvents {
    @On("messageCreate")
    onMessage([message]: ArgsOf<"messageCreate">, client: Client) {
        if (process.env["MODE"] !== "production" && message.guildId !== process.env["GUILD_DEV_ID"]) {
            return;
        }

        if (message.mentions.has(process.env["APP_CLIENT_ID"] ?? "-1") && !message.mentions.everyone) {
            message.reply("How do you do, fellow human? (Use me by using slash `/`)");
        }

        /*if (message.content.toLowerCase().includes("bump")) {
            message.react("🤜");
        }*/
    }
    @On("messageDelete")
    onMessageDelete([message]: ArgsOf<"messageDelete">, client: Client) {
        console.log("Message Deleted", client.user?.username, message.content);
    }
}
