using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Expenses;

public static class CreateExpense
{
    public static async Task<Outcome<ExpenseDetail>> HandleAsync(AppDbContext db, ExpenseFields fields)
    {
        var (category, field, problem) = await ExpenseCategories.CheckAsync(db, fields, keeping: null);

        if (category is null)
        {
            return Outcome<ExpenseDetail>.Invalid(field!, problem!);
        }

        var expense = new Expense
        {
            ExpenseDate = fields.Date,
            CategoryId = fields.CategoryId,
            Amount = fields.Amount,
            Note = fields.Note,
        };

        db.Expenses.Add(expense);
        await db.SaveChangesAsync();

        return Outcome<ExpenseDetail>.Done(ExpenseDetail.From(expense, category));
    }
}
