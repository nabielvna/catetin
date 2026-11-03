import { v7 as uuidv7, validate, version } from "uuid";

export function newId(): string {
  return uuidv7();
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && validate(value) && [4, 7].includes(version(value));
}
