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

export interface Slot {
    localId: number;
    name: string;
    player: string | null;
}

export interface Deployment {
    name: string;
    area: Area;
    id: string;
    release: Instant | null;
    start: Instant | null;
}

export interface ExtendedDeployment /*extends Deployment*/ {
    slots: Slot[];
}

export class UnitafService {
    private _deploymentsCache = new NodeCache({ stdTTL: 59 });

    constructor(private _sessionId = "qc6c628jvv6rf5gttkajsse084tl1cun") {}

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
        console.log("FETCH: get deployment: " + id);

        const response = await fetch(`https://unitedtaskforce.net/operations/auth/${id}/orbat`, {
            method: "GET",
            headers: {
                Cookie: `kotaxdev_session=${this._sessionId}`,
            },
        });

        const document = this.parseHtml(await response.text());

        const rows = [...document.querySelectorAll("tr").values()];

        const slots: Slot[] = rows
            .map((row, i) => {
                if (!row.children[0].hasAttribute("data-toggle")) {
                    return null;
                }

                const name = (row.children[1]?.textContent ?? row.children[1]?.children[0]?.textContent)?.trim();

                if (name === undefined || name === "Reservist") {
                    return null;
                }

                const player = row.children[3]?.children[0]?.textContent?.trim() ?? null;

                return {
                    localId: -1,
                    name,
                    player,
                };
            })
            .filter((s) => s !== null)
            .map((s, i) => ({
                localId: i,
                name: s!.name,
                player: s!.player,
            }));

        return {
            slots,
        };
    };

    deployments = async (): Promise<Deployment[]> => {
        console.log("FETCH: getting deployments");
        const cached = this._deploymentsCache.get<Deployment[]>("deployments");

        if (cached !== undefined) {
            return cached;
        }

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
                const id = (rowElement.childNodes[0] as HTMLAnchorElement | undefined)?.href
                    ?.replace("/operations/auth/", "")
                    ?.replace("/orbat", "");

                const dateTimeVarName = `utcTime${id}`;
                const dateTimeVarStartIndex = page.indexOf(dateTimeVarName);
                const dateTimeStartIndex = dateTimeVarStartIndex + dateTimeVarName.length + 2;

                const startDateTime =
                    dateTimeVarStartIndex > 0
                        ? Instant.parse(
                              page.substring(dateTimeStartIndex, dateTimeStartIndex + 19).replace(" ", "T") + "Z"
                          )
                        : null;

                let release: Instant | null = null;

                if (page.includes(`${id}_orbat_count`)) {
                    const releaseDateTimeVarName = `date_${id}=new Date(Date.parse(`;
                    const releaseDateTimeVarStartIndex = page.indexOf(releaseDateTimeVarName);
                    const releaseDateTimeStartIndex = releaseDateTimeVarStartIndex + releaseDateTimeVarName.length + 1;

                    release =
                        releaseDateTimeVarStartIndex > 0
                            ? Instant.parse(
                                  page
                                      .substring(releaseDateTimeStartIndex, releaseDateTimeStartIndex + 19)
                                      .replace(" ", "T") + "Z"
                              )
                            : null;
                }

                const titleElement = rowElement.children[1]?.children[0]?.children[0]?.children[0] as
                    | HTMLHeadingElement
                    | undefined;

                const description = titleElement?.children[0]?.innerHTML;

                let area: Area = "operation";

                [...areaMap.keys()].forEach((key) => {
                    if (description?.toLowerCase().includes(key)) {
                        area = areaMap.get(key) ?? "operation";
                    }
                });

                return {
                    name: titleElement?.innerHTML.slice(0, titleElement?.innerHTML.indexOf("<")) ?? "",
                    area: area,
                    id: id ?? "-1",
                    release,
                    start: startDateTime,
                };
            })
            .filter((d) => d.id !== "-1");

        this._deploymentsCache.set("deployments", deployments, 59);

        return deployments;
    };

    private parseHtml = (html: string) => {
        return new JSDOM(html).window.document;
    };
}
