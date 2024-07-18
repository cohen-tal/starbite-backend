export interface Token {
  token: string;
  type: "access_token" | "refresh_token";
  expiresAt: number;
  issuer?: string;
  subject?: string;
}

/* Database result interfaces */

export interface UserDB {
  id: string;
  name: string;
  email: string;
  image: string;
}

export interface RestaurantDB {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  rating: string;
  date_added: Date;
  edited_at: Date | null;
  added_by: UserDB;
  address: string;
  reviews: ReviewsDB[];
  categories: string[];
  images?: string[];
}

export interface ReviewsDB {
  id: string;
  text: string;
  rating: number;
  author: UserDB;
  date_added: Date;
  edited_at: Date | null;
  restaurant_id: string;
  images?: string[];
}

/* API response interfaces */

export interface UserAPI extends UserDB {}

export interface RestaurantAPI {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating: number;
  addedBy: UserDB;
  images: string[];
  reviews: ReviewAPI[];
  categories: string[];
  dateAdded: Date;
  dateEdited: Date | null;
}

export interface ReviewAPI {
  id: string;
  text: string;
  rating: number;
  author: UserAPI;
  dateAdded: Date;
  dateEdited: Date | null;
}
