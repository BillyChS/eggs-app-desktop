using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Expenses;

public static class UpdateExpense
{
    /// <summary>Everything can change. A retired category can stay, but can't be chosen again once left.</summary>
    public static async Task<Outcome<ExpenseDetail>> HandleAsync(AppDbContext db, Guid id, ExpenseFields fields)
    {
        var expense = await db.Expenses.FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (expense is null)
        {
            return Outcome<ExpenseDetail>.NotFound();
        }

        var (category, field, problem) = await ExpenseCategories.CheckAsync(db, fields, keeping: expense.CategoryId);

        if (category is null)
        {
            return Outcome<ExpenseDetail>.Invalid(field!, problem!);
        }

        expense.ExpenseDate = fields.Date;
        expense.CategoryId = fields.CategoryId;
        expense.Amount = fields.Amount;
        expense.Note = fields.Note;
        await db.SaveChangesAsync();

        return Outcome<ExpenseDetail>.Done(ExpenseDetail.From(expense, category));
    }
}
