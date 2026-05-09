export interface Place {
  name: string;
  lat: number;
  lng: number;
  loc: string;
  cat?: string;
  desc?: string;
  emoji?: string;
  image?: string;
}

export interface ItineraryItem extends Place {
  id: string;
  time: string;
  day: number;
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  category: string;
  day?: number;
  createdAt: string;
}

export interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  itinerary: ItineraryItem[];
  expenses: Expense[];
  budget: number;
  currency: string;
  ownerId: string;
  sharedWith?: string[];
  color?: string;
  updatedAt: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}
