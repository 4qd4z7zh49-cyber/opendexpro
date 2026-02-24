import { getCountryCallingCode, type CountryCode } from "libphonenumber-js";

/**
 * ISO 3166-1 alpha-2 country codes (static list)
 * This avoids Intl.supportedValuesOf('region') which is NOT valid.
 */
export const REGION_CODES: string[] = [
  "AF","AL","DZ","AS","AD","AO","AI","AQ","AG","AR","AM","AW","AU","AT","AZ",
  "BS","BH","BD","BB","BY","BE","BZ","BJ","BM","BT","BO","BA","BW","BR","BN",
  "BG","BF","BI","KH","CM","CA","CV","KY","CF","TD","CL","CN","CO","KM","CG",
  "CD","CR","CI","HR","CU","CY","CZ","DK","DJ","DM","DO","EC","EG","SV","GQ",
  "ER","EE","ET","FK","FO","FJ","FI","FR","GF","PF","GA","GM","GE","DE","GH",
  "GI","GR","GL","GD","GP","GU","GT","GN","GW","GY","HT","HN","HK","HU","IS",
  "IN","ID","IR","IQ","IE","IL","IT","JM","JP","JO","KZ","KE","KI","KP","KR",
  "KW","KG","LA","LV","LB","LS","LR","LY","LI","LT","LU","MO","MG","MW","MY",
  "MV","ML","MT","MH","MQ","MR","MU","YT","MX","FM","MD","MC","MN","ME","MS",
  "MA","MZ","MM","NA","NR","NP","NL","NC","NZ","NI","NE","NG","MK","NO","OM",
  "PK","PW","PA","PG","PY","PE","PH","PL","PT","PR","QA","RE","RO","RU","RW",
  "KN","LC","VC","WS","SM","ST","SA","SN","RS","SC","SL","SG","SK","SI","SB",
  "SO","ZA","ES","LK","SD","SR","SE","CH","SY","TW","TJ","TZ","TH","TL","TG",
  "TO","TT","TN","TR","TM","TC","TV","UG","UA","AE","GB","US","UY","UZ","VU",
  "VE","VN","VG","VI","YE","ZM","ZW"
];

export type CountryOption = {
  code: string;     // "US"
  name: string;     // "United States"
  dial: string;     // "+1"
};

export function buildCountryOptions(locale: string = "en"): CountryOption[] {
  const dn: Intl.DisplayNames | null =
    typeof Intl !== "undefined" && typeof Intl.DisplayNames !== "undefined"
      ? new Intl.DisplayNames([locale], { type: "region" })
      : null;

  const options: CountryOption[] = REGION_CODES.map((code) => {
    let name = code;
    if (dn) {
      const maybe = dn.of(code);
      if (typeof maybe === "string" && maybe.trim()) name = maybe;
    }

    let dial = "";
    try {
      dial = "+" + getCountryCallingCode(code as CountryCode);
    } catch {
      dial = "";
    }

    return { code, name, dial };
  })
    // filter out weird ones without calling code (rare)
    .filter((c) => c.dial)
    // sort alphabetically by name
    .sort((a, b) => a.name.localeCompare(b.name));

  return options;
}
