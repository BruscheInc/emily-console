/* Buzzin · review section design defaults. Shared by the store widget (bz-reviews.js) and the Customize editor.
   A store's saved design only holds what was changed; everything else comes from here. */
window.BZR_DEFAULT_DESIGN = {
  colors: {
    text: "#2C3E50", muted: "#676986", heading: "#2C3E50", bg: "", border: "#E5E5EB",
    star: "#242F3F", star_empty: "#FFFFFF", star_outline: "#2C3E50",
    bar: "#242F3F", bar_bg: "#EDEEF2",
    button_bg: "#242F3F", button_text: "#FFFFFF", button_border: "#242F3F",
    chip_bg: "#FFFFFF", chip_text: "#2C3E50", chip_border: "#2C3E50", chip_on_bg: "#242F3F", chip_on_text: "#FFFFFF",
    avatar_bg: "#242F3F", avatar_text: "#FFFFFF", verified: "#2C3E50", verified_badge: "#242F3F",
    link: "#0E7A82", card_bg: "#FFFFFF", card_border: "#E5E5EB", reply_bg: "#F7F7F8", filters_bg: "#F7F7F8",
  },
  font: { family: "inherit", heading_family: "inherit", size: 14, title_size: 16, title_weight: 600, heading_size: 15, average_size: 18 },
  layout: {
    max_width: 0, margin_top: 28, margin_bottom: 28, row_style: "lines", card_radius: 6, row_gap: 20,
    aside_width: 262, aside_box: true, top_layout: "split", button_radius: 8, button_style: "filled", chip_radius: 8,
    placement: "before_related", stars_placement: "under_title",
  },
  stars: { size_title: 17, size_summary: 15, size_review: 13, shape: "star", outline: true },
  photos: { strip_count: 12, strip_size: 100, review_size: 64, radius: 0 },
  show: {
    title_stars: true, title_count: true, heading: false, average: true, histogram: true, recommend: true, photo_strip: true,
    summary: true, topics: true, tab: true, filters: true, write: true, sort: true, count: true,
    avatar: true, name: true, verified: true, reviewing: true, recommend_row: true, attributes: true,
    date: true, review_title: true, review_photos: true, reply: true, helpful: true,
  },
  behavior: { sort: "media", per_page: 10, date_format: "short", read_more_chars: 600, clip_lines: 0 },
  text: {
    heading: "Customer Reviews", based_on: "Based on {count} reviews", recommend: "would recommend this product",
    summary_title: "Reviews Summary", topics_title: "Customers Talked About", tab: "Reviews ({count})",
    filters: "Filters", write: "Write a Review", clear: "Clear filters", sort: "Sort",
    sort_media: "Most Helpful", sort_newest: "Most Recent", sort_highest: "Highest Rating", sort_lowest: "Lowest Rating",
    count: "{count} reviews", verified: "Verified Buyer", reviewing: "Reviewing", recommend_row: "I recommend this product",
    size_label: "Size Purchased", helpful: "Was this helpful?", read_more: "Read more", more: "Show more reviews",
    reply: "Response from {brand}", empty: "Be the first to review this product.", no_match: "No reviews match.",
    title_count: "{count} Reviews",
    form_title: "Write a review", form_submit: "Submit review", form_thanks: "Thank you!",
  },
  mobile: {
    font_size: 14, title_size: 15, aside: "compact", photo_strip: true, strip_size: 84, review_photo_size: 64,
    per_page: 6, hide_reviewing: true, hide_recommend_row: true, buttons_full: false,
  },
  custom_css: "",
};
