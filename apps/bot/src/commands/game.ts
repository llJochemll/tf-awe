import { ApplicationCommandOptionType, Client, CommandInteraction, GuildMember } from "discord.js";
import { Discord, Once, Slash, SlashGroup, SlashOption } from "discordx";
import { JSONFile, Low } from "lowdb";

const gameNames = ["Arma 3", "Squad", "Ready or not", "Escape from Tarkov", "DayZ", "Reforger", "War Thunder", "Barotrauma", "DCS"] as const;

type GameName = typeof gameNames[number];

interface Game {
    name: GameName;
}

interface GameData {
    games: { [id in GameName]: Game | undefined };
}

const db = new Low<GameData>(new JSONFile<GameData>(`${process.env["DB_FOLDER"]}game.json`));

@Discord()
@SlashGroup({
    name: "game",
    description: "Game commands",
})
@SlashGroup("game")
export abstract class RemindCommand {
    @Once({ event: "ready" })
    private async init(message: unknown, client: Client, guardPayload: any) {
        await db.read();

        await client.guilds.fetch();
        const guilds = client.guilds.cache;

        await Promise.all(
            gameNames.map(async (gameName) => {
                if (db.data === null) {
                    return;
                }

                if (db.data.games[gameName] === undefined) {
                    db.data.games[gameName] = {
                        name: gameName
                    };
                }

                guilds.forEach(async (guild) => {
                    await guild.roles.fetch();

                    if (![...guild.roles.cache.values()].some((x) => x.name === gameName)) {
                        try {
                            await guild.roles.create({
                                mentionable: true,
                                name: gameName,
                            });
                        } catch (e) {
                            console.log(e);
                        }
                    }
                });
            })
        );

        await db.write();
    }

    @Slash({ name: "subscribe", description: "subscribe" })
    private async subscribe(
        @SlashOption({
            name: "game",
            type: ApplicationCommandOptionType.String,
            autocomplete: (interaction) => {
                interaction.respond(gameNames.map((n) => ({ name: n, value: n })));
            },
            description: "The game to subscribe to",
        })
        gameName: GameName,
        interaction: CommandInteraction
    ) {
        await db.read();

        if (db.data === null) {
            interaction.reply(`Something went wrong, go annoy Jochem`);
            return;
        }

        const role = interaction.guild?.roles.cache.find((x) => x.name === gameName)!;

        await (interaction.member as GuildMember).roles.add(role);

        interaction.reply(`You are subscribed to pings for ${gameName}`);
    }

    @Slash({ name: "unsubscribe", description: "unsubscribe" })
    private async unsubscribe(
        @SlashOption({
            name: "game",
            type: ApplicationCommandOptionType.String,
            autocomplete: (interaction) => {
                interaction.respond(gameNames.map((n) => ({ name: n, value: n })));
            },
            description: "The game to unsubscribe from",
        })
        gameName: GameName,
        interaction: CommandInteraction
    ) {
        await db.read();

        if (db.data === null) {
            interaction.reply(`Something went wrong, go annoy Jochem`);
            return;
        }

        const role = interaction.guild?.roles.cache.find((x) => x.name === gameName)!;

        await (interaction.member as GuildMember).roles.remove(role);

        interaction.reply(`You are unsubscribed from pings for ${gameName}`);
    }
}
