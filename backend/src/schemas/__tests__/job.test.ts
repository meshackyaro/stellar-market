import { createJobSchema } from "../job";

describe("createJobSchema", () => {
  it("requires deadline", () => {
    const result = createJobSchema.safeParse({
      title: "Build Stellar escrow flow",
      description: "Implement backend validation for escrow initialization and job creation.",
      budget: 500,
      skills: ["TypeScript"],
      category: "Development",
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected createJobSchema to reject a missing deadline.");
    }

    expect(result.error.issues.some(issue => issue.path.includes("deadline"))).toBe(true);
  });
});
