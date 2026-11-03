"use client";

import { createStore } from "@/lib/store";
import type { TourId, TourParams } from "@/lib/tours";

export type ActiveTour = { id: TourId; params: TourParams; vars: Record<string, string>; cardId?: string };
type CardStatus = "done" | "dismissed";

const CARDS_KEY = "catetin.tourCards";
const CARDS_MAX = 50;

function loadCards(): Record<string, CardStatus> {
  try {
    return JSON.parse(localStorage.getItem(CARDS_KEY) ?? "{}") as Record<string, CardStatus>;
  } catch {
    return {};
  }
}

export const tourStore = createStore<{
  active: ActiveTour | null;
  done: ActiveTour | null;
  cards: Record<string, CardStatus>;
}>({ active: null, done: null, cards: typeof window === "undefined" ? {} : loadCards() });

export function setCardStatus(id: string, status: CardStatus) {
  const cards = { ...tourStore.get().cards, [id]: status };
  const keys = Object.keys(cards);
  for (const k of keys.slice(0, Math.max(0, keys.length - CARDS_MAX))) delete cards[k];
  tourStore.set({ cards });
  try {
    localStorage.setItem(CARDS_KEY, JSON.stringify(cards));
  } catch {}
}

export const startTour = (tour: ActiveTour) => tourStore.set({ active: tour, done: null });
export const stopTour = () => tourStore.set({ active: null });

export function finishTour() {
  const { active } = tourStore.get();
  if (!active) return;
  if (active.cardId) setCardStatus(active.cardId, "done");
  tourStore.set({ active: null, done: active });
}

export const TOUR_EVENT = "catetin:tour";
