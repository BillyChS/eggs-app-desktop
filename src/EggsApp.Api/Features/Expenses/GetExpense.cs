using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Expenses;

public static class GetExpense
{
    public static async Task<ExpenseDetail?> HandleAsync(AppDbContext db, Guid id)
    {
        var expense = await db.Expenses.AsNoTracking().FirstOrDefaultAsync(candidate => candidate.Id == id);

        return expense is null
            ? null
            : ExpenseDetail.From(expense, await ExpenseCategories.FindRefsAsync(db, [expense.CategoryId]));
    }
}
