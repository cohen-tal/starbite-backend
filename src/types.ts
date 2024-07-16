export interface Token {
  token: string;
  type: "access_token" | "refresh_token";
  expiresAt: number;
  issuer?: string;
  subject?: string;
}

export interface UserAPI {
  id: string;
  email: string;
  image: string;
}

export interface RestaurantAPI {
  id?: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  addedBy: string;
  images: string[];
  reviews?: ReviewAPI[];
  dateAdded?: Date;
  dateEdited?: Date;
}

export interface ReviewAPI {
  id: string;
  text: string;
  rating: number;
  addedBy: UserAPI;
}
