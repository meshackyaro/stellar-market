describe("Portfolio Upload Configuration", () => {
  it("should have correct max portfolio file size (5MB)", () => {
    const { PORTFOLIO_MAX_FILE_SIZE } = require("../../config/upload");
    expect(PORTFOLIO_MAX_FILE_SIZE).toBe(5 * 1024 * 1024);
  });

  it("should have correct max portfolio items limit", () => {
    const { PORTFOLIO_MAX_ITEMS } = require("../../config/upload");
    expect(PORTFOLIO_MAX_ITEMS).toBe(10);
  });

  it("should allow image MIME types for portfolio", () => {
    const { PORTFOLIO_MIME_TYPES } = require("../../config/upload");
    expect(PORTFOLIO_MIME_TYPES).toContain("image/jpeg");
    expect(PORTFOLIO_MIME_TYPES).toContain("image/png");
    expect(PORTFOLIO_MIME_TYPES).toContain("image/gif");
    expect(PORTFOLIO_MIME_TYPES).toContain("image/webp");
    expect(PORTFOLIO_MIME_TYPES).toContain("application/pdf");
  });

  it("should not allow disallowed MIME types for portfolio", () => {
    const { PORTFOLIO_MIME_TYPES } = require("../../config/upload");
    expect(PORTFOLIO_MIME_TYPES).not.toContain("video/mp4");
    expect(PORTFOLIO_MIME_TYPES).not.toContain("application/zip");
  });

  it("should export portfolioUpload multer instance", () => {
    const { portfolioUpload } = require("../../config/upload");
    expect(portfolioUpload).toBeDefined();
  });
});
