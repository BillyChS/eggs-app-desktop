using EggsApp.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EggsApp.Api.Features.Expenses;

/// <summary>Money spent on the business. It counts on <see cref="ExpenseDate"/>, cash-basis.</summary>
public sealed class Expense : BaseEntity
{
    public const int NoteMaxLength = 200;

    /// <summary>The day it was spent, not the day it was typed in.</summary>
    public DateOnly ExpenseDate { get; set; }

    public Guid CategoryId { get; set; }

    /// <summary>Whole colones, at least 1.</summary>
    public long Amount { get; set; }

    /// <summary>Optional, except for a category that needs a description, like "Otro".</summary>
    public string? Note { get; set; }
}

internal sealed class ExpenseConfiguration : IEntityTypeConfiguration<Expense>
{
    public void Configure(EntityTypeBuilder<Expense> builder)
    {
        builder.HasIndex(expense => expense.ExpenseDate);
        builder.Property(expense => expense.Note).HasMaxLength(Expense.NoteMaxLength);

        // A category with expenses can only be retired, never removed, so old expenses always have a name to show.
        builder.HasOne<ExpenseCategory>()
            .WithMany()
            .HasForeignKey(expense => expense.CategoryId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.ToTable(table => table.HasCheckConstraint("CK_Expenses_AmountIsPositive", "\"Amount\" > 0"));
    }
}
