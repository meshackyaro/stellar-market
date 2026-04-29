import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import Home from "@/app/page";

// Mock child components for integration test
jest.mock("@/components/landing/HeroSection", () => {
  const MockedComponent = () => <div data-testid="hero-section" />;
  MockedComponent.displayName = "HeroSection";
  return MockedComponent;
});
jest.mock("@/components/landing/StatsSection", () => {
  const MockedComponent = () => <div data-testid="stats-section" />;
  MockedComponent.displayName = "StatsSection";
  return MockedComponent;
});
jest.mock("@/components/landing/HowItWorksSection", () => {
  const MockedComponent = () => <div data-testid="how-it-works-section" />;
  MockedComponent.displayName = "HowItWorksSection";
  return MockedComponent;
});
jest.mock("@/components/landing/FeaturedJobsCarousel", () => {
  const MockedComponent = () => <div data-testid="featured-jobs-section" />;
  MockedComponent.displayName = "FeaturedJobsCarousel";
  return MockedComponent;
});
jest.mock("@/components/landing/CTASection", () => {
  const MockedComponent = () => <div data-testid="cta-section" />;
  MockedComponent.displayName = "CTASection";
  return MockedComponent;
});

describe("Landing Page Integration", () => {
  it("renders all five sections of the landing page", () => {
    render(<Home />);
    expect(screen.getByTestId("hero-section")).toBeInTheDocument();
    expect(screen.getByTestId("stats-section")).toBeInTheDocument();
    expect(screen.getByTestId("how-it-works-section")).toBeInTheDocument();
    expect(screen.getByTestId("featured-jobs-section")).toBeInTheDocument();
    expect(screen.getByTestId("cta-section")).toBeInTheDocument();
  });
});
