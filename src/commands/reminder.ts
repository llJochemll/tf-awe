import { CommandInteraction, MessageEmbed, MessagePayload } from "discord.js";
import { Client, Discord, Once, Slash, SlashGroup, SlashOption } from "discordx";
import { JSONFile, Low } from "lowdb";
import { areas, UnitafService } from "../unitaf/service.js";
import type { Area } from "../unitaf/service.js";
import { ChronoUnit, Instant, TemporalUnit } from "@js-joda/core";

interface Reminder {
    type: "release" | "start";
    area: Area;
    user: string;
    advance: number;
}

interface ReminderData {
    reminders: Reminder[];
}

const db = new Low<ReminderData>(new JSONFile<ReminderData>(`${process.env["DB_FOLDER"]}reminder.json`));

@Discord()
export abstract class RemindMessage {
    @Once("ready")
    private async onReady(message: unknown, client: Client, guardPayload: any) {
        const unitafService = new UnitafService();

        await db.read();

        setInterval(async () => {
            try {
                await db.read();

                const deployments = await unitafService.deployments();

                for (const deployment of deployments) {
                    db.data?.reminders.forEach(async (reminder) => {
                        if (deployment.release !== null && typeof reminder.advance === "number") {
                            const notifyTime = deployment.release.minus(reminder.advance, ChronoUnit.MINUTES);

                            const difference = Instant.now().until(notifyTime, ChronoUnit.SECONDS);

                            if (
                                reminder.area === deployment.area &&
                                difference <= 60 && difference > 0
                            ) {
                                const message = new MessageEmbed()
                                    .setTitle(`Reminder for ORBAT release of ${deployment.name}`)
                                    .setDescription(
                                        `[ORBAT](https://unitedtaskforce.net/operations/auth/${deployment.id}/orbat) releases <t:${deployment.release.epochSecond()}:R>`
                                    );

                                const user = await client.users.fetch(reminder.user);

                                user.send({ embeds: [message] });
                            }
                        }
                    });
                };
            } catch (e) {
                console.log(e);
            }
        }, 60000);
    }
}

@Discord()
@SlashGroup("remind", "Add a reminder", {
    add: "Add a reminder",
    remove: "Remove a reminder",
})
export abstract class RemindCommand {
    @Slash("release")
    @SlashGroup("add")
    private async addRelease(
        @SlashOption("area", {
            type: "STRING",
            autocomplete: (interaction) => {
                interaction.respond(areas.filter((a) => a !== "special").map((s) => ({ name: s, value: s })));
            },
            description: "The operations for which you want to receive the reminders",
        })
        area: Area,
        @SlashOption("advance", {
            type: "NUMBER",
            required: false,
            description: "Time in minutes before the release that you want to be notified",
        })
        advance: number = 5,
        interaction: CommandInteraction
    ) {
        await db.read();

        if (db.data === null) {
            interaction.reply(`Something went wrong, go annoy Jochem`);
            return;
        }

        db.data.reminders = db.data?.reminders.filter(
            (r) => r.type !== "release" || r.area !== area || r.user !== interaction.user.id
        );

        db.data.reminders.push({
            advance,
            area,
            type: "release",
            user: interaction.user.id,
        });

        await db.write();

        if (area === "operation") {
            interaction.reply(`Okay, I will remind you ${advance} minutes before an operation is released`);
        } else {
            interaction.reply(`Okay, I will remind you ${advance} minutes before a ${area} FTX is released`);
        }
    }

    @Slash("release")
    @SlashGroup("remove")
    private async removeRelease(
        @SlashOption("area", {
            type: "STRING",
            autocomplete: (interaction) => {
                interaction.respond(areas.map((s) => ({ name: s, value: s })));
            },
            description: "The operations for which you want to receive the reminders",
        })
        area: Area,
        interaction: CommandInteraction
    ) {
        await db.read();

        if (db.data === null) {
            interaction.reply(`Something went wrong, go annoy Jochem`);
            return;
        }

        db.data.reminders = db.data?.reminders.filter(
            (r) => r.type !== "release" || r.area !== area || r.user !== interaction.user.id
        );

        await db.write();

        if (area === "operation") {
            interaction.reply(`Okay, I won't remind you anymore about operation releases`);
        } else {
            interaction.reply(`Okay, I won't remind you anymore about ${area} FTX releases`);
        }
    }
}
