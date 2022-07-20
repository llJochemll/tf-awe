import "reflect-metadata";
import { Interaction, Message, GatewayIntentBits } from "discord.js";
import { Client } from "discordx";
import { dirname, importx } from "@discordx/importer";
import { Koa } from "@discordx/koa";
import { config } from "dotenv";
import { UnitafService } from "./unitaf/service.js";

config();

export const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    // If you only want to use global commands only, comment this line
    botGuilds: [
        (client) =>
            process.env["MODE"] === "production"
                ? client.guilds.cache.map((guild) => guild.id).filter((id) => id !== process.env["GUILD_DEV_ID"])
                : process.env["GUILD_DEV_ID"] ?? "-1",
    ],
});

client.once("ready", async () => {
    // make sure all guilds are in cache
    await client.guilds.fetch();

    // init all application commands
    await client.initApplicationCommands({
        guild: { log: true },
        global: { log: true },
    });

    // init permissions; enabled log to see changes
    //await client. initApplicationPermissions(true);

    // uncomment this line to clear all guild commands,
    // useful when moving to global commands from guild commands
    //  await client.clearApplicationCommands(
    //    ...client.guilds.cache.map((g) => g.id)
    //  );

    console.log("Bot started");
});

client.on("interactionCreate", (interaction: Interaction) => {
    client.executeInteraction(interaction);
});

client.on("messageCreate", (message: Message) => {
    client.executeCommand(message);
});

async function start() {
    // with cjs
    // await importx(__dirname + "/{events,commands}/**/*.{ts,js}");
    // with ems
    await importx(dirname(import.meta.url) + "/{events,commands,api}/**/*.{ts,js}");

    // let's start the bot
    if (!process.env.BOT_TOKEN) {
        throw Error("Could not find BOT_TOKEN in your environment");
    }
    await client.login(process.env.BOT_TOKEN); // provide your bot token

    // ************* rest api section: start **********

    // api: preare server
    const server = new Koa();

    // api: need to build the api server first
    await server.build();

    // api: let's start the server now
    const port = process.env.PORT ?? 3000;
    server.listen(port, () => {
        console.log(`discord api server started on ${port}`);
        console.log(`visit localhost:${port}/guilds`);
    });

    // ************* rest api section: end **********
}

const run = () => {
    try {
        start()
    } catch (e) {
        run();
    }
}

run();