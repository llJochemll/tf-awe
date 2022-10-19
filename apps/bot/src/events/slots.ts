import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    Client,
    EmbedBuilder,
    Message,
    MessageActionRowComponentBuilder,
    TextChannel,
} from "discord.js";
import { ButtonComponent, Discord, Once } from "discordx";
import { Instant } from "@js-joda/core";
import { UnitafService } from "unitaf";
import { scheduleJob } from "node-schedule";
import { JSONFile, Low } from "lowdb";

interface NotificationData {
    deployments: { [id: string]: DeploymentData | undefined };
}

interface DeploymentData {
    id: string;
    mainMessageId: string | null;
    mentionUsers: string[];
    pingMessages: {
        id: string;
        slotId: string;
    }[];
    snapshot: { id: string; isOpen: boolean }[];
}

const db = new Low<NotificationData>(new JSONFile<NotificationData>(`${process.env["DB_FOLDER"]}slots.json`));

@Discord()
export abstract class RemindMessage {
    @Once({ event: "ready" })
    private async init(message: unknown, client: Client, guardPayload: any) {
        await db.read();

        const unitafService = new UnitafService();
        const channel = (await client.channels.fetch(process.env["BOT_CHANNEL_ID"] ?? "-1")) as TextChannel;

        scheduleJob("10 */2 * * * *", async () => {
            await db.read();

            if (db.data === null) {
                console.log("Failed to read data");
                return;
            }

            const deployments = await unitafService.deployments();

            if (deployments.length === 0) {
                console.log("Found no deployments");
                return;
            }

            for (const id in db.data.deployments) {
                if (!deployments.some((x) => x.id === id)) {
                    const deploymentData = db.data.deployments[id];

                    if (deploymentData === undefined) {
                        return;
                    }

                    const channel = (await client.channels.fetch(process.env["BOT_CHANNEL_ID"] ?? "-1")) as TextChannel;

                    if (deploymentData.mainMessageId !== null) {
                        await channel?.messages.delete(deploymentData.mainMessageId);
                    }

                    for (const message of deploymentData.pingMessages) {
                        try {
                            await channel?.messages.delete(message.id);
                        } catch (e) {
                            console.log(e);
                        }
                    }

                    db.data.deployments[id] = undefined;
                }
            }

            for (const basicDeployment of deployments) {
                let deploymentData = db.data.deployments[basicDeployment.id];
                const deployment = await unitafService.deployment(basicDeployment.id);

                if (deploymentData === undefined) {
                    deploymentData = {
                        id: deployment.id,
                        mainMessageId: null,
                        mentionUsers: [],
                        pingMessages: [],
                        snapshot: deployment.slots.map((s) => ({ id: s.id, isOpen: s.player === null })),
                    };

                    db.data.deployments[deployment.id] = deploymentData;
                }

                // Check for changes, update messages
                if (deployment.release?.isBefore(Instant.now().plusSeconds(300)) || deployment.release === null) {
                    try {
                        let mainMessage: Message<true>;

                        if (deploymentData.mainMessageId === null) {
                            const messageEmbed = new EmbedBuilder()
                                .setTitle(
                                    `ORBAT for ${deployment.name}: ${deployment.description} ${
                                        deployment.release === null ? "is released" : "releases <t:" + deployment.release.epochSecond() + ":R>"
                                    }`
                                )
                                .setDescription(`You will be notified of any slot that opens up, so be prepared to be pinged a lot`)
                                .setURL(`https://unitedtaskforce.net/operations/auth/${deployment.id}/orbat`);

                            const row = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`notify-slot-enable-${deployment.id}`)
                                    .setLabel("Enable notifications")
                                    .setStyle(ButtonStyle.Primary),
                                new ButtonBuilder()
                                    .setCustomId(`notify-slot-disable-${deployment.id}`)
                                    .setLabel("Disable notifications")
                                    .setStyle(ButtonStyle.Danger)
                            );

                            const channel = await client.channels.fetch(process.env["BOT_CHANNEL_ID"] ?? "-1");

                            mainMessage = await (channel as TextChannel).send({
                                embeds: [messageEmbed],
                                components: [row],
                            });

                            db.data.deployments[deployment.id] = {
                                ...db.data.deployments[deployment.id]!,
                                mainMessageId: mainMessage.id,
                            };
                        } else {
                            mainMessage = await channel?.messages.fetch(deploymentData.mainMessageId);
                        }

                        const embed = EmbedBuilder.from(mainMessage.embeds[0])
                            .setTitle(
                                `ORBAT for ${deployment.name}: ${deployment.description} ${
                                    deployment.release === null ? "is released" : "releases <t:" + deployment.release.epochSecond() + ":R>"
                                }`
                            )
                            .setFields([
                                ...deployment.groups
                                    .filter((g) => g.slots.some((s) => s.player === null))
                                    .map((group) => ({
                                        name: group.name,
                                        value: group.slots
                                            .filter((s) => s.player === null)
                                            .map((s) => s.name)
                                            .join("\n"),
                                        inline: false,
                                    })),
                                {
                                    name: "Notifications enabled for:",
                                    value: deploymentData.mentionUsers.length ?? 0 > 0 ? `<@${deploymentData.mentionUsers.join("> <@")}>` : "Nobody",
                                    inline: false,
                                },
                            ]);

                        await mainMessage.edit({ embeds: [embed] });

                        for (const slot of deployment.slots) {
                            if (slot.player !== null) {
                                for (const pingMessage of deploymentData.pingMessages.filter((p) => p.slotId === slot.id)) {
                                    try {
                                        await channel?.messages.delete(pingMessage.id);
                                    } catch (e) {
                                        console.log(e);
                                    }

                                    db.data.deployments[deployment.id]!.pingMessages = db.data.deployments[deployment.id]!.pingMessages.filter(p => p.id !== pingMessage.id);
                                }
                            } else if (!(deploymentData.snapshot.find((s) => s.id === slot.id)?.isOpen ?? true)) {
                                const channel = await client.channels.fetch(process.env["BOT_CHANNEL_ID"] ?? "-1");

                                let mentions = "";

                                if (db.data.deployments[deployment.id]!.mentionUsers.length > 0) {
                                    mentions = `\n<@${db.data.deployments[deployment.id]!.mentionUsers.join("> <@")}>`;
                                }

                                const message = await (channel as TextChannel).send(
                                    `${slot.group.name} ${slot.name} slot just opened on ${deployment.name}. (https://unitedtaskforce.net/operations/auth/${deployment.id}/orbat)${mentions}`
                                );

                                db.data.deployments[deployment.id]!.pingMessages = [
                                    ...db.data.deployments[deployment.id]!.pingMessages,
                                    { id: message.id, slotId: slot.id },
                                ];
                            }
                        }
                    } catch (e) {
                        console.error(e);
                    }
                }

                db.data.deployments[deployment.id]!.snapshot = deployment.slots.map((s) => ({ id: s.id, isOpen: s.player === null }));
            }

            await db.write();
        });
    }

    @ButtonComponent({ id: /notify-slot-enable-.*/ })
    async onSlotEnable(interaction: ButtonInteraction) {
        const embed = interaction.message.embeds[0];

        const id = interaction.customId.replace("notify-slot-enable-", "");

        await db.read();

        if (db.data === null) {
            console.log("Failed to add user to slot notifications");
            return;
        }

        const deploymentData = db.data.deployments[id];

        if (deploymentData !== undefined && !deploymentData.mentionUsers.includes(interaction.user.id)) {
            db.data.deployments[id] = {
                ...deploymentData,
                mentionUsers: [...(db.data.deployments[id]?.mentionUsers ?? []), interaction.user.id],
            };

            await db.write();
        }

        const newEmbed = EmbedBuilder.from(embed).setFields([
            ...embed.fields.slice(0, -1),
            {
                name: "Notifications enabled for:",
                value: db.data.deployments[id]!.mentionUsers.length ?? 0 > 0 ? `<@${db.data.deployments[id]!.mentionUsers.join("> <@")}>` : "Nobody",
                inline: false,
            },
        ]);

        await interaction.message.edit({ embeds: [newEmbed] });

        interaction.deferUpdate();
    }

    @ButtonComponent({ id: /notify-slot-disable-.*/ })
    async onSlotDisable(interaction: ButtonInteraction) {
        const embed = interaction.message.embeds[0];

        const id = interaction.customId.replace("notify-slot-disable-", "");

        await db.read();

        if (db.data === null) {
            console.log("Failed to add user to slot notifications");
            return;
        }

        if (db.data.deployments[id] !== undefined && (db.data.deployments[id]?.mentionUsers.includes(interaction.user.id) ?? false)) {
            db.data.deployments[id]!.mentionUsers = db.data.deployments[id]?.mentionUsers.filter((n) => !n.includes(interaction.user.id)) ?? [];

            await db.write();
        }

        const newEmbed = EmbedBuilder.from(embed).setFields([
            ...embed.fields.slice(0, -1),
            {
                name: "Notifications enabled for:",
                value: db.data.deployments[id]!.mentionUsers.length ?? 0 > 0 ? `<@${db.data.deployments[id]!.mentionUsers.join("> <@")}>` : "Nobody",
                inline: false,
            },
        ]);

        await interaction.message.edit({ embeds: [newEmbed] });

        interaction.deferUpdate();
    }
}
