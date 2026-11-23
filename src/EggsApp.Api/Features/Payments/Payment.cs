using EggsApp.Api.Data;
using EggsApp.Api.Features.Customers;
using EggsApp.Api.Features.Sales;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace EggsApp.Api.Features.Payments;

/// <summary>
/// An abono: money a customer paid toward what they owe. It lowers their balance as a whole; one that points at a credit
/// sale (<see cref="SaleId"/> or <see cref="ForSaleId"/>) pays that sale first (see SaleStatuses). It counts as income
/// on <see cref="PaymentDate"/>.
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

    /// <summary>
    /// The credit sale this was paid with, when it was paid as the sale was made ("¿Pagó algo ahora?"). Such an abono
    /// is changed and deleted from its sale only, so it always matches the sale's customer and date and stays below
    /// its total. Null for an abono entered on its own.
    /// </summary>
    public Guid? SaleId { get; set; }

    /// <summary>
    /// The credit sale it was paid toward from that sale's Abonar button, which it pays first. Unlike
    /// <see cref="SaleId"/>, it doesn't follow the sale: it's changed and deleted like any abono, and if the sale is
    /// lowered, moved or deleted, what doesn't fit in it pays the customer's other fiados. Null for any other abono.
    /// </summary>
    public Guid? ForSaleId { get; init; }
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

        builder.HasOne<Sale>()
            .WithMany()
            .HasForeignKey(payment => payment.SaleId)
            .OnDelete(DeleteBehavior.Restrict);

        // Sales are only ever soft-deleted, so Restrict never blocks one; SaleStatuses skips a deleted target.
        builder.HasOne<Sale>()
            .WithMany()
            .HasForeignKey(payment => payment.ForSaleId)
            .OnDelete(DeleteBehavior.Restrict);

        builder.ToTable(table => table.HasCheckConstraint("CK_Payments_AmountIsPositive", "\"Amount\" > 0"));
    }
}
