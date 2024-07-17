import { RestaurantAPI, RestaurantDB, ReviewAPI, ReviewsDB } from "./types";

export function parseToRestaurantAPI(from: RestaurantDB): RestaurantAPI {
  const restaurant: RestaurantAPI = {
    id: from.id,
    name: from.name,
    lat: from.latitude,
    lng: from.longitude,
    addedBy: from.added_by,
    address: from.address,
    images: from.images ?? [],
    categories: from.categories,
    reviews:
      from.reviews.map((reviewFromDB) => parseToReviewAPI(reviewFromDB)) ?? [],
    dateAdded: from.date_added,
    dateEdited: from.edited_at,
  };

  return restaurant;
}

export function parseToReviewAPI(from: ReviewsDB): ReviewAPI {
  const review: ReviewAPI = {
    id: from.id,
    text: from.text,
    rating: from.rating,
    author: from.author,
    dateAdded: from.date_added,
    dateEdited: from.edited_at,
  };

  return review;
}
