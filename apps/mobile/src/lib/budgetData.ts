// Loads what the Budget and Home screens need for a month.
import { buildBudgetView, type BudgetView } from './budget';
import { fetchBudgets, fetchCategories, fetchSpendingItems, type Category } from './data';
import { todayLocal } from './dates';

export interface MonthData {
  view: BudgetView;
  categories: Category[];
}

export async function fetchMonth(userId: string, month: string): Promise<MonthData> {
  const [categories, budgets, items] = await Promise.all([
    fetchCategories(userId),
    fetchBudgets(userId),
    fetchSpendingItems(month),
  ]);
  return {
    view: buildBudgetView({ month, today: todayLocal(), categories, budgets, items }),
    categories,
  };
}
