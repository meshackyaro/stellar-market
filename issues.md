#293 Fix: services page filter state is lost on browser back navigation — URL query params do not reflect selected filters
Repo Avatar
stellarmarket-labs/stellar-market
Problem
When a user selects filters on /services (category, price range, rating) and navigates to a service detail page, pressing browser Back resets all filters to their defaults. Filter state is held in React component state only, not URL params.

Fix
Sync filter values with URL search params using useSearchParams (Next.js App Router) or nuqs:

/services?category=design&minPrice=50&maxPrice=500&minRating=4
On mount, initialise filter state from URL params so back-navigation restores the exact filtered view.


#289 Build: add job and profile share button with copyable deep link — no social sharing or direct link feature exists
Repo Avatar
stellarmarket-labs/stellar-market
Problem
Users cannot easily share a job listing or freelancer profile with someone outside the platform. There is no share/copy-link affordance on job detail or profile pages.

Acceptance criteria
 Add a "Share" button to job detail and public profile pages.
 On click: copy canonical URL to clipboard + show "Link copied!" toast.
 If Web Share API is available (mobile), use native share sheet instead.
 OG/Twitter meta tags on these pages should include title, description, and preview image (see companion SEO issue)

 #290 Build: add SEO metadata (og:title, og:description, canonical, Twitter card) to job and profile pages — all pages share identical generic meta tags
Repo Avatar
stellarmarket-labs/stellar-market
Problem
Every page on the site shares the same static Stellar Market and no Open Graph tags. Job listings and freelancer profiles that are shared externally show only a blank link preview with no context.

Acceptance criteria
 Use Next.js generateMetadata (App Router) to set page-specific metadata.
 Job detail: og:title = job title, og:description = first 160 chars of description, og:image = generated OG image or platform default.
 Profile page: og:title = freelancer name + tagline, og:description = bio excerpt, og:image = avatar.
 Canonical tag on all pages.
 Twitter card summary_large_image meta.

 #288 Build: add mobile-responsive hamburger navigation — sidebar collapses on small screens but leaves no way to open it again
Repo Avatar
stellarmarket-labs/stellar-market
Problem
On viewports < 768 px the sidebar navigation collapses to nothing. There is no hamburger button or slide-out drawer to access navigation links, making the app unusable on mobile.

Acceptance criteria
 Add a hamburger icon button to the top navbar on mobile viewports.
 Tapping it opens a full-height slide-in drawer with all nav links.
 Drawer closes on link tap, backdrop tap, or swipe-left gesture.
 Active route is highlighted.
 Focus trap inside drawer for keyboard accessibility.
 Tested on iOS Safari and Android Chrome.

