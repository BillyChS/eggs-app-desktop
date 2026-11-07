using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Expenses;

public static class ListExpenses
{
    /// <returns>The expenses from one date to another, both included, newest first, and what they add up to.</returns>
    public static async Task<ExpenseListResponse> HandleAsync(AppDbContext db, DateOnly from, DateOnly to)
    {
        var expenses = await db.Expenses
            .AsNoTracking()
            .Where(expense => expense.ExpenseDate >= from && expense.ExpenseDate <= to)
            .OrderByDescending(expense => expense.ExpenseDate)
            .ThenByDescending(expense => expense.CreatedAt)
            .ToListAsync();

        var categories = await ExpenseCategories.FindRefsAsync(db, expenses.Select(expense => expense.CategoryId));

        return new ExpenseListResponse(
            [.. expenses.Select(expense => ExpenseDetail.From(expense, categories))],
            expenses.Sum(expense => expense.Amount));
    }
}
