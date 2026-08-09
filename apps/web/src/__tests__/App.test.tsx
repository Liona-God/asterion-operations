import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "../App.js";

describe("Asterion command center", () => {
  it("renders operational risks and keeps the live connector explicit", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Command center" })).toBeInTheDocument();
    expect(screen.getByText("2 orders need an immediate decision")).toBeInTheDocument();
    expect(screen.getByText("Pressure instability on boiler B-3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load live dashboard" }));
    expect(screen.getByText("Enter an organization ID to load the live command center.")).toBeInTheDocument();
  });
});
