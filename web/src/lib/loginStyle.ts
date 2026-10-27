import type { SignInLook } from "@/components/SignIn";

type Raw = string | string[] | undefined;

const pick = (v: Raw): SignInLook | undefined => {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "a" || s === "b" ? s : undefined;
};

/**
 * Which sign-in design to show: the address can ask for one (?look=b, handy when showing a client the options),
 * otherwise the setting LOGIN_LOOK_OWNER / LOGIN_LOOK_STAFF (a or b), otherwise A.
 * It only changes how the screen looks. The login itself is identical.
 */
export function loginLook(role: "owner" | "staff", fromAddress?: Raw): SignInLook {
  const fromEnv = role === "owner" ? process.env.LOGIN_LOOK_OWNER : process.env.LOGIN_LOOK_STAFF;
  return pick(fromAddress) ?? pick(fromEnv) ?? "a";
}
