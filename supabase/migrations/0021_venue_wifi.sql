-- 0021: the venue's guest Wi-Fi, shown on the guest page (a Wi-Fi button with the network name and a copy-password button).
--   * wifi_ssid: the network name guests see on their phone.
--   * wifi_password: the guest network password (it is shown to every guest on the public page, so use a guest network).
-- Both optional (null = no Wi-Fi button). Set by the owner on the Rules screen.
-- Safe to apply before or after the code: the code reads these columns on their own and carries on without them.

alter table venues add column if not exists wifi_ssid text
  check (wifi_ssid is null or length(wifi_ssid) between 1 and 64);
alter table venues add column if not exists wifi_password text
  check (wifi_password is null or length(wifi_password) <= 128);
