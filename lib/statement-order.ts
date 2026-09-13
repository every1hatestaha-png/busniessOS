import { businessDateKey } from "@/lib/server/business-time";

export type StatementOrderRow = {
  id: string;
  date: Date;
  createdAt: Date;
};

export function sortStatementRowsByBusinessDay<T extends StatementOrderRow>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const businessDateCompare = businessDateKey(left.date).localeCompare(businessDateKey(right.date));
    if (businessDateCompare !== 0) return businessDateCompare;

    const createdAtCompare = left.createdAt.getTime() - right.createdAt.getTime();
    if (createdAtCompare !== 0) return createdAtCompare;

    return left.id.localeCompare(right.id);
  });
}
