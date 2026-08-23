import dotenv from 'dotenv';
dotenv.config();

import { ExpensesService } from '../modules/expenses/expenses.service.js';
import { pool } from '../config/db.js';

async function testPnL() {
  console.log('Testing getPnLSummary(2026, 8)...');
  try {
    const summary = await ExpensesService.getPnLSummary(2026, 8);
    console.log('=== P&L Financial Scorecard ===');
    console.log('Gross Revenue:', summary.financials.gross_revenue, 'EGP');
    console.log('Total Salaries:', summary.financials.total_salaries, 'EGP');
    console.log('Total Expenses:', summary.financials.total_expenses, 'EGP');
    console.log('Total Operating Costs:', summary.financials.total_operating_costs, 'EGP');
    console.log('Net Profit:', summary.financials.net_profit, 'EGP');
    console.log('Profit Margin:', summary.financials.profit_margin, '%');
    console.log('Categories count:', summary.expenses_metrics.categories_breakdown.length);
    console.log('6-Months trend points:', summary.six_months_trend.length);
    console.log('Test successful!');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    await pool.end();
  }
}

testPnL();
