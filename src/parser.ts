import {
  HistoryReview,
  RecentReview,
  RecentReviewDB,
  RestaurantAPI,
  RestaurantDB,
  ReviewAPI,
  ReviewsDB,
} from "./types";

export function parseToRestaurantAPI(from: RestaurantDB): RestaurantAPI {
  const restaurant: RestaurantAPI = {
    id: from.id,
    name: from.name,
    lat: from.latitude,
    lng: from.longitude,
    rating: Number(from.rating),
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
    likes: from.likes,
    dislikes: from.dislikes,
    dateAdded: new Date(from.date_added),
    dateEdited: from.edited_at ? new Date(from.edited_at) : null,
  };

  return review;
}

export function parseToRecentReview(from: RecentReviewDB): RecentReview {
  const review: RecentReview = {
    id: from.id,
    image: from.image,
    name: from.name,
    rating: Number(from.rating),
    restaurantId: from.restaurant_id,
    text: from.text,
  };

  return review;
}

export function parseToHistoryReview(
  from: Omit<ReviewsDB, "author">
): HistoryReview {
  const historyReview: HistoryReview = {
    id: from.id,
    rating: from.rating,
    dateAdded: new Date(from.date_added),
    dateEdited: from.edited_at ? new Date(from.edited_at) : null,
    text: from.text,
    dislikes: Number(from.dislikes),
    likes: Number(from.likes),
  };

  return historyReview;
}
