using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Expenses;

public static class ListExpenses
{
    /// <returns>
    /// The expenses from one date to another, both included, newest first, what they add up to, and the totals by
    /// category.
    /// </returns>
    public static async Task<ExpenseListResponse> HandleAsync(AppDbContext db, DateOnly from, DateOnly to)
    {
        var expenses = await db.Expenses
            .AsNoTracking()
            .Where(expense => expense.ExpenseDate >= from && expense.ExpenseDate <= to)
            .OrderByDescending(expense => expense.ExpenseDate)
            .ThenByDescending(expense => expense.CreatedAt)
            .ToListAsync();

        var categories = await ExpenseCategories.FindRefsAsync(db, expenses.Select(expense => expense.CategoryId));

        var details = expenses.Select(expense => ExpenseDetail.From(expense, categories)).ToList();

        var byCategory = details
            .GroupBy(expense => expense.Category.Id)
            .Select(group => new CategoryTotal(
                group.Key,
                group.First().Category.Name,
                group.Sum(expense => expense.Amount),
                group.Count()))
            .OrderByDescending(category => category.Total)
            .ThenBy(category => category.Name, CustomerNames.SpanishOrder)
            .ToList();

        return new ExpenseListResponse(details, expenses.Sum(expense => expense.Amount), byCategory);
    }
}
