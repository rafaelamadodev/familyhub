export const weekdayOptions = [
  { value: "MO", label: "Segunda" },
  { value: "TU", label: "Terça" },
  { value: "WE", label: "Quarta" },
  { value: "TH", label: "Quinta" },
  { value: "FR", label: "Sexta" },
  { value: "SA", label: "Sábado" },
  { value: "SU", label: "Domingo" },
];
export function daysFromRule(rule: string | null): string[] {
  return rule?.match(/(?:^|;)BYDAY=([^;]+)/)?.[1].split(",") ?? [];
}
