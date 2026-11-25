import { describe, expect, it } from "vitest";
import { directionsUrl, telUrl } from "../src/lib/placeLinks";

describe("branch links on the guest card", () => {
  it("prefers the branch's own maps link, then its coordinates", () => {
    expect(directionsUrl({ mapsUrl: "https://maps.app.goo.gl/abc", lat: 26.1, lng: 50.5 })).toBe("https://maps.app.goo.gl/abc");
    expect(directionsUrl({ mapsUrl: null, lat: 26.1, lng: 50.5 })).toBe("https://www.google.com/maps/search/?api=1&query=26.1,50.5");
    expect(directionsUrl({ mapsUrl: null, lat: null, lng: null })).toBeNull();
  });
  it("turns a written phone number into a tel: link", () => {
    expect(telUrl("+973 1700 0000")).toBe("tel:+97317000000");
    expect(telUrl("(1700) 0000")).toBe("tel:17000000");
    expect(telUrl("12")).toBeNull();
    expect(telUrl(null)).toBeNull();
  });
});
