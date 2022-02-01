import { ButtonInteraction, MessageActionRow, MessageButton, MessageEmbed, TextChannel } from "discord.js";
import { ButtonComponent, Client, Discord, Once } from "discordx";
import { JSONFile, Low } from "lowdb";
import { UnitafService } from "../unitaf/service.js";

interface SlotNotification {
    id: string;
    users: string[];
}

interface NotificationData {
    slotNotifications: { [id: string]: string[] };
}

const db = new Low<NotificationData>(new JSONFile<NotificationData>(`${process.env["DB_FOLDER"]}notification.json`));

@Discord()
export abstract class RemindMessage {
    @Once("ready")
    private async onMessage(message: unknown, client: Client, guardPayload: any) {
        const unitafService = new UnitafService();

        return;

        await db.read();

        //setInterval(async () => {
        await db.read();

        const deployments = await unitafService.deployments();

        [deployments[deployments.length - 1]].forEach(async (deployment) => {
            if (deployment.release !== null) {
                const notifyTime = deployment.release.add({
                    minutes: 5,
                });

                if (
                    /*Temporal.Now.instant().until(notifyTime, {
                            smallestUnit: "minutes",
                            roundingMode: "halfExpand",
                        }).minutes === 0*/ true
                ) {
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
        //}, 60000);
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

        if (!db.data.slotNotifications[id].includes(interaction.user.id)) {
            db.data.slotNotifications[id] = [...db.data.slotNotifications[id], interaction.user.id];

            await db.write();
        }

        embed.fields = [
            {
                name: "Notifications enabled for:",
                value:
                    db.data.slotNotifications[id].length > 0
                        ? `<@${db.data.slotNotifications[id].join("> <@")}>`
                        : "Nobody",
            },
        ];

        interaction.update({ embeds: [embed] });
    }

    @ButtonComponent(/notify-slot-disable-.*/)
    async onSlotDisable(interaction: ButtonInteraction) {
        const embed = interaction.message.embeds[0];

        const id = interaction.customId.replace("notify-slot-disable-", "");

        if (db.data === null) {
            console.log("Failed to add user to slot notifications");
            return;
        }

        if (db.data.slotNotifications[id].includes(interaction.user.id)) {
            db.data.slotNotifications[id] = db.data.slotNotifications[id].filter(
                (n) => !n.includes(interaction.user.id)
            );

            await db.write();
        }

        embed.fields = [
            {
                name: "Notifications enabled for:",
                value:
                    db.data.slotNotifications[id].length > 0
                        ? `<@${db.data.slotNotifications[id].join("> <@")}>`
                        : "Nobody",
            },
        ];

        interaction.update({ embeds: [embed] });
    }
}
