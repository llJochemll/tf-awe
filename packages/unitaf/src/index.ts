import { JSDOM } from "jsdom";
import fetch from "node-fetch";
import NodeCache from "node-cache";
import { Instant } from "@js-joda/core";

export const areas = [
    "operation",
    "infantry",
    "leadership",
    "medical",
    "at",
    "marksman",
    "comms",
    "support",
    "mission",
    "cavalry",
    "heli",
    "plane",
    "special",
] as const;

export type Area = typeof areas[number];

const areaMap: Map<string, Area> = new Map([
    ["operation", "operation"],
    ["core infantry", "infantry"],
    ["field leadership", "leadership"],
    ["medical", "medical"],
    ["anti-vehicle", "at"],
    ["marksmanship", "marksman"],
    ["communication", "comms"],
    ["combat support", "support"],
    ["mission support", "mission"],
    ["cavalry", "cavalry"],
    ["rotary aircrew", "heli"],
    ["fixed-wing aircrew", "plane"],
    ["intake", "special"],
]);

export interface Group {
    name: string;
    slots: Slot[];
}

export interface Slot {
    group: Group;
    name: string;
    player: string | null;
    id: string;
}

export interface Deployment {
    name: string;
    description: string;
    area: Area;
    id: string;
    release: Instant | null;
    start: Instant | null;
}

export interface ExtendedDeployment extends Deployment {
    groups: Group[];
    slots: Slot[];
}

export class UnitafService {
    private _deploymentsCache = new NodeCache({ stdTTL: 59 });
    private _deploymentsListCache = new NodeCache({ stdTTL: 59 });

    constructor(private _sessionId = "qjnpbvmvqoqdhh96colm4d3jldolu54d") {}

    login = async (username: string, password: string) => {
        /*const data = new FormData();
		data.append('identity', username);
		data.append('password', password);*/

        const response = await fetch("https://unitedtaskforce.net/login", {
            method: "POST",
            headers: {
                "Content-Type": "multipart/form-data",
                Cookie: `kotaxdev_session=${this._sessionId}`,
            },
            body: `identity=${username}&password=${password}`,
        });
    };

    deployment = async (id: string): Promise<ExtendedDeployment> => {
        const cached = this._deploymentsCache.get<ExtendedDeployment>(id);

        if (cached !== undefined) {
            return cached;
        }

        console.log("FETCH: get deployment: " + id);

        const deployment = (await this.deployments()).find((x) => x.id === id)!;

        const response = await fetch(`https://unitedtaskforce.net/operations/auth/${id}/orbat`, {
            method: "GET",
            headers: {
                Cookie: `kotaxdev_session=${this._sessionId}`,
            },
        });

        const document = this.parseHtml(await response.text());

        const rows = [...document.querySelectorAll("tr").values()];

        //const groups: Group[] = [];
        const groups = new Map<string, Group>();

        let groupName = "";

        const slots: Slot[] = rows
            .map((row, i) => {
                if (row.children[0].tagName === "TH") {
                    groupName = row.children[0]?.children[0]?.children[0].textContent?.replaceAll(`"`, "")?.trim() ?? "";
                    if (!groups.has(groupName)) {
                        groups.set(groupName, { name: groupName, slots: [] });
                    }
                }

                if (!row.children[0].hasAttribute("data-toggle")) {
                    return null;
                }

                let name: string | undefined = row.children[1]?.children[0]?.textContent?.trim();

                if (name === "") {
                    name = row.children[1]?.textContent?.trim();
                }

                if (name === undefined || name === "Reservist") {
                    return null;
                }

                name = name.split("   ")[0];

                const player = row.children[3]?.children[0]?.textContent?.trim() ?? null;

                const group = groups.get(groupName)!;
                const slot = {
                    group,
                    name,
                    player,
                    id: `${group.name}-${name}-${group.slots.filter(s => s.name == name).length}`
                };

                group.slots.push(slot);

                return slot;
            })
            .filter((s) => s !== null)
            .map((s, i) => ({
                id: s!.id,
                group: s!.group,
                name: s!.name,
                player: s!.player,
            }));

        return {
            ...deployment,
            groups: [...groups.values()].filter((x) => x.slots.length > 0),
            slots,
        };
    };

    deployments = async (): Promise<Deployment[]> => {
        const cached = this._deploymentsListCache.get<Deployment[]>("deployments");

        if (cached !== undefined) {
            return cached;
        }

        console.log("FETCH: getting deployments");

        const response = await fetch("https://unitedtaskforce.net/campaigns/deployments", {
            method: "GET",
            headers: {
                Cookie: `kotaxdev_session=${this._sessionId}`,
            },
        });

        const page = await response.text();

        const document = this.parseHtml(page);

        const deployments = Array.from(document.getElementsByClassName("campaign-row"))
            .map((rowElement) => {
                const id = (rowElement.childNodes[0] as HTMLAnchorElement | undefined)?.href?.replace("/operations/auth/", "")?.replace("/orbat", "");

                const dateTimeVarName = `utcTime${id}`;
                const dateTimeVarStartIndex = page.indexOf(dateTimeVarName);
                const dateTimeStartIndex = dateTimeVarStartIndex + dateTimeVarName.length + 4;

                const startDateTime =
                    dateTimeVarStartIndex > 0 ? Instant.parse(page.substring(dateTimeStartIndex, dateTimeStartIndex + 19).replace(" ", "T") + "Z") : null;

                let release: Instant | null = null;

                if (page.includes(`${id}_orbat_count`)) {
                    const releaseDateTimeVarName = `date_${id} = new Date(Date.parse(`;
                    const releaseDateTimeVarStartIndex = page.indexOf(releaseDateTimeVarName);
                    const releaseDateTimeStartIndex = releaseDateTimeVarStartIndex + releaseDateTimeVarName.length + 1;

                    release =
                        releaseDateTimeVarStartIndex > 0
                            ? Instant.parse(page.substring(releaseDateTimeStartIndex, releaseDateTimeStartIndex + 19).replace(" ", "T") + "Z")
                            : null;
                }

                const titleElement = rowElement.children[1]?.children[0]?.children[0]?.children[0] as HTMLHeadingElement | undefined;

                const description = titleElement?.children[0]?.textContent;

                let area: Area = "operation";

                [...areaMap.keys()].forEach((key) => {
                    if (description?.toLowerCase().includes(key)) {
                        area = areaMap.get(key) ?? "operation";
                    }
                });

                return {
                    name: titleElement?.innerHTML.slice(0, titleElement?.innerHTML.indexOf("<")) ?? "",
                    description: description ?? "",
                    area: area,
                    id: id ?? "-1",
                    release,
                    start: startDateTime,
                };
            })
            .filter((d) => d.id !== "-1");

        this._deploymentsListCache.set("deployments", deployments, 59);

        return deployments;
    };

    private parseHtml = (html: string) => {
        return new JSDOM(html).window.document;
    };
}
