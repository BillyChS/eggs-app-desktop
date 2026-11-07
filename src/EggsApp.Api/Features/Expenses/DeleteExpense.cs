using EggsApp.Api.Data;
using EggsApp.Api.Features.Common;
using Microsoft.EntityFrameworkCore;

namespace EggsApp.Api.Features.Expenses;

public static class DeleteExpense
{
    /// <summary>A soft delete.</summary>
    public static async Task<Outcome<bool>> HandleAsync(AppDbContext db, Guid id)
    {
        var expense = await db.Expenses.FirstOrDefaultAsync(candidate => candidate.Id == id);

        if (expense is null)
        {
            return Outcome<bool>.NotFound();
        }

        db.Expenses.Remove(expense);
        await db.SaveChangesAsync();

        return Outcome<bool>.Done(true);
    }
}
