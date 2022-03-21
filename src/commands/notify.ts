import { ChronoUnit } from "@js-joda/core";
import { ButtonInteraction, Client, MessageActionRow, MessageButton, MessageEmbed, TextChannel } from "discord.js";
import { ButtonComponent, Discord, Once } from "discordx";
import { JSONFile, Low } from "lowdb";
import { UnitafService } from "../unitaf/service.js";
import type { ExtendedDeployment } from "../unitaf/service.js";

interface SlotNotification {
    messageId: string;
    mentionUsers: string[];
    messages: string[];
}

interface NotificationData {
    slotNotifications: { [id: string]: SlotNotification | undefined };
    snapshots: { [id: string]: ExtendedDeployment | undefined };
}

const db = new Low<NotificationData>(new JSONFile<NotificationData>(`${process.env["DB_FOLDER"]}notification.json`));

@Discord()
export abstract class RemindMessage {
    @Once("ready")
    private async onMessage(message: unknown, client: Client, guardPayload: any) {
        const unitafService = new UnitafService();

        setInterval(async () => {
            const deployments = await unitafService.deployments();

            if (deployments.length === 0) {
                console.log("Found no deployments");
                return;
            }

            await db.read();

            if (db.data === null) {
                console.log("Failed to read data");
                return;
            }

            for (const id of Object.keys(db.data?.slotNotifications ?? {})) {
                if (deployments.filter((d) => d.id === id).length === 0) {
                    await this.removeDeployment(client, id);
                }
            }

            for (const deployment of deployments) {
                if (deployment.release === null && db.data.slotNotifications[deployment.id] === undefined) {
                    const messageEmbed = new MessageEmbed()
                        .setTitle(
                            `ORBAT for ${deployment.name} has been released, click the button below for slot notifications`
                        )
                        .setDescription(
                            `You will be notified of any slot that opens up, so be prepared to be pinged a lot`
                        )
                        .setURL(`https://unitedtaskforce.net/operations/auth/${deployment.id}/orbat`);

                    const row = new MessageActionRow().addComponents(
                        new MessageButton()
                            .setCustomId(`notify-slot-enable-${deployment.id}`)
                            .setLabel("Enable notifications")
                            .setStyle("PRIMARY"),
                        new MessageButton()
                            .setCustomId(`notify-slot-disable-${deployment.id}`)
                            .setLabel("Disable notifications")
                            .setStyle("DANGER")
                    );

                    const channel = await client.channels.fetch(process.env["BOT_CHANNEL_ID"] ?? "-1");

                    const message = await (channel as TextChannel).send({ embeds: [messageEmbed], components: [row] });

                    db.data.slotNotifications[deployment.id] = {
                        mentionUsers: [],
                        messageId: message.id,
                        messages: [],
                    };

                    await db.write();
                }

                if (db.data.slotNotifications[deployment.id] !== undefined) {
                    const current = await unitafService.deployment(deployment.id);
                    const snapshot = db.data.snapshots[deployment.id];

                    const currentSlots = new Map<string, number>();
                    const snapshotSlots = new Map<string, number>();

                    for (const slot of current.slots) {
                        const existing = currentSlots.get(slot.name) ?? 0;

                        currentSlots.set(slot.name, existing + (slot.player === null ? 1 : 0));
                    }

                    for (const slot of snapshot?.slots ?? []) {
                        const existing = snapshotSlots.get(slot.name) ?? 0;

                        snapshotSlots.set(slot.name, existing + (slot.player === null ? 1 : 0));
                    }

                    for (const [slotName, open] of currentSlots.entries()) {
                        if ((snapshotSlots.get(slotName) ?? 999) < open) {
                            const channel = await client.channels.fetch(process.env["BOT_CHANNEL_ID"] ?? "-1");

                            let mentions = "";

                            if (db.data.slotNotifications[deployment.id]!.mentionUsers.length > 0) {
                                mentions = `\n<@${db.data.slotNotifications[deployment.id]!.mentionUsers.join(
                                    "> <@"
                                )}>`;
                            }

                            const message = await (channel as TextChannel).send(
                                `${slotName} slot just opened on ${deployment.name}. (https://unitedtaskforce.net/operations/auth/${deployment.id}/orbat)${mentions}`
                            );

                            db.data.slotNotifications[deployment.id]!.messages = [
                                ...db.data.slotNotifications[deployment.id]!.messages,
                                message.id,
                            ];

                            await db.write();
                        }
                    }

                    await this.updateMessage(client, deployment.id, currentSlots);

                    /*if (snapshot !== undefined) {
                        current.slots.forEach(async (slot) => {
                            const snapshotSlot = snapshot.slots.filter(
                                (s) => s.localId === slot.localId && s.name === slot.name
                            )[0] as Slot | undefined;

                            if (
                                snapshotSlot?.player !== undefined &&
                                snapshotSlot?.player !== null &&
                                slot.player === undefined
                            ) {
                                const channel = await client.channels.fetch(process.env["BOT_CHANNEL_ID"] ?? "-1");

                                (channel as TextChannel).send(
                                    `A ${slot.name} just opened on ${deployment.name}. (https://unitedtaskforce.net/operations/auth/${deployment.id}/orbat)`
                                );
                            }
                        });
                    }*/

                    db.data.snapshots[deployment.id] = current;

                    await db.write();
                }
            }
        }, 120000);

        // end interval

        /*await db.read();

        //setInterval(async () => {
        await db.read();

        //const deployments = await unitafService.deployments();

        /*[deployments[deployments.length - 1]].forEach(async (deployment) => {
            if (deployment.release !== null) {
                const notifyTime = deployment.release.plus(5, ChronoUnit.MINUTES);

                if (
                    /*Temporal.Now.instant().until(notifyTime, {
                            smallestUnit: "minutes",
                            roundingMode: "halfExpand",
                        }).minutes === 0 true;*/
        /*) {
                    await db.read();

                    if (db.data === null) {
                        console.log("Failed to create slot notification message");
                        return;
                    }

                    db.data.slotNotifications[deployment.id] = [];
                    console.log(deployment.id);
                    console.log(db.data);
                    console.log(db.data.slotNotifications);
                    await db.write();

                    const message = new MessageEmbed()
                        .setTitle(
                            `ORBAT for ${deployment.name} has been released, click the button below for slot notifications`
                        )
                        .setDescription(
                            `You will be notified of any slot that opens up, so be prepared to be pinged a lot`
                        );

                    const row = new MessageActionRow().addComponents(
                        new MessageButton()
                            .setCustomId(`notify-slot-enable-${deployment.id}`)
                            .setLabel("Enable notifications")
                            .setStyle("PRIMARY"),
                        new MessageButton()
                            .setCustomId(`notify-slot-disable-${deployment.id}`)
                            .setLabel("Disable notifications")
                            .setStyle("DANGER")
                    );

                    const channel = await client.channels.fetch(process.env["BOT_CHANNEL_ID"] ?? "-1");

                    (channel as TextChannel).send({ embeds: [message], components: [row] });
                }
            }
        });
        //}, 60000);*/
    }

    @ButtonComponent(/notify-slot-enable-.*/)
    async onSlotEnable(interaction: ButtonInteraction) {
        const embed = interaction.message.embeds[0];

        const id = interaction.customId.replace("notify-slot-enable-", "");

        await db.read();

        if (db.data === null) {
            console.log("Failed to add user to slot notifications");
            return;
        }

        if (
            db.data.slotNotifications[id] !== undefined &&
            !db.data.slotNotifications[id]?.mentionUsers.includes(interaction.user.id)
        ) {
            db.data.slotNotifications[id] = {
                ...(db.data.slotNotifications[id] ?? { messageId: "-1", messages: [] }),
                mentionUsers: [...(db.data.slotNotifications[id]?.mentionUsers ?? []), interaction.user.id],
            };

            await db.write();
        }

        await this.updateMessage(interaction.client, id);

        interaction.deferUpdate();
    }

    @ButtonComponent(/notify-slot-disable-.*/)
    async onSlotDisable(interaction: ButtonInteraction) {
        const embed = interaction.message.embeds[0];

        const id = interaction.customId.replace("notify-slot-disable-", "");

        if (db.data === null) {
            console.log("Failed to add user to slot notifications");
            return;
        }

        if (
            db.data.slotNotifications[id] !== undefined &&
            (db.data.slotNotifications[id]?.mentionUsers.includes(interaction.user.id) ?? false)
        ) {
            db.data.slotNotifications[id]!.mentionUsers =
                db.data.slotNotifications[id]?.mentionUsers.filter((n) => !n.includes(interaction.user.id)) ?? [];

            await db.write();
        }

        await this.updateMessage(interaction.client, id);

        interaction.deferUpdate();
    }

    private async updateMessage(client: Client, id: string, slots?: Map<string, number>) {
        await db.read();

        const slotNotification = db.data?.slotNotifications[id];

        if (slotNotification === undefined) {
            return;
        }

        const channel = (await client.channels.fetch(process.env["BOT_CHANNEL_ID"] ?? "-1")) as TextChannel;
        try {
            const message = await channel?.messages.fetch(slotNotification?.messageId);

            const embed = message.embeds[0];

            const slotEntries =
                slots !== undefined ? [...slots.entries()].filter(([name, open]) => open > 0) : undefined;

            embed.fields = [
                {
                    name: "Open slots:",
                    value:
                        slotEntries !== undefined
                            ? slotEntries.length > 0
                                ? slotEntries.map(([name, open]) => `- ${name}: ${open} open`).join("\n")
                                : "No open slots"
                            : embed.fields[0].value,
                    inline: false,
                },
                {
                    name: "Notifications enabled for:",
                    value:
                        slotNotification.mentionUsers.length ?? 0 > 0
                            ? `<@${slotNotification.mentionUsers.join("> <@")}>`
                            : "Nobody",
                    inline: false,
                },
            ];

            await message.edit({ embeds: [embed] });
        } catch (e) {
            console.error(e);
        }
    }

    private async removeDeployment(client: Client, id: string) {
        await db.read();

        if (db.data === null) {
            console.log("Failed to read data");
            return;
        }

        const slotNotification = db.data.slotNotifications[id];

        if (slotNotification === undefined) {
            return;
        }

        const channel = (await client.channels.fetch(process.env["BOT_CHANNEL_ID"] ?? "-1")) as TextChannel;

        await channel?.messages.delete(slotNotification?.messageId);

        slotNotification.messages.forEach(async (message) => {
            try {
                await channel?.messages.delete(message);
            } catch (e) {
                console.log(e);
            }
        });

        db.data.slotNotifications[id] = undefined;

        await db.write();
    }
}
