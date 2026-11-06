using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EggsApp.Api.Features.Payments;

/// <summary>
/// An abono: money a customer paid toward what they owe. It lowers their balance as a whole and isn't tied to any one
/// credit sale. It counts as income on <see cref="PaymentDate"/>.
/// </summary>
public sealed class Payment : BaseEntity
{
    public const int NoteMaxLength = 200;

    /// <summary>Who paid. Never changes: an abono that went to the wrong customer is deleted and entered again.</summary>
    public Guid CustomerId { get; init; }

    /// <summary>The day it was paid, not the day it was typed in.</summary>
    public DateOnly PaymentDate { get; set; }

    /// <summary>Whole colones, at least 1, and never more than the customer owed.</summary>
    public long Amount { get; set; }

    public string? Note { get; set; }
}

internal sealed class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> builder)
    {
        builder.HasIndex(payment => payment.PaymentDate);
        builder.Property(payment => payment.Note).HasMaxLength(Payment.NoteMaxLength);

        builder.HasOne<Customer>()
            .WithMany()
            .HasForeignKey(payment => payment.CustomerId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.ToTable(table => table.HasCheckConstraint("CK_Payments_AmountIsPositive", "\"Amount\" > 0"));
    }
}
