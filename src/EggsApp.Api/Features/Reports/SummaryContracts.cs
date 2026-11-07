namespace EggsApp.Api.Features.Reports;

/// <summary>What came in, cash-basis: cash sales and abonos, each on its own date.</summary>
/// <param name="Cash">Cash sales.</param>
/// <param name="Payments">Abonos.</param>
public sealed record CameIn(long Cash, long Payments)
{
    public long Total => Cash + Payments;
}

public sealed record CategorySpent(string Name, long Total);

public sealed record Spent(long Total, IReadOnlyList<CategorySpent> ByCategory);

/// <param name="CartonType">"A" holds 15 eggs and "B" holds 30.</param>
/// <param name="Quantity">Cartons sold, cash and credit both: what left the farm, not what was paid.</param>
public sealed record CartonsSold(string CartonType, long Quantity);

/// <summary>One day with any sale, abono or expense.</summary>
public sealed record DaySummary(DateOnly Date, long CameIn, long Spent)
{
    public long Net => CameIn - Spent;
}

/// <param name="Net">What came in minus what was spent. Below zero when more was spent.</param>
/// <param name="CreditSold">Sold on credit in the period: owed, not income.</param>
/// <param name="OwedTotal">What all customers owe today, whatever the period.</param>
/// <param name="Days">The days with anything in them, oldest first.</param>
public sealed record SummaryResponse(
    DateOnly From,
    DateOnly To,
    CameIn CameIn,
    Spent Spent,
    long Net,
    long CreditSold,
    long OwedTotal,
    IReadOnlyList<CartonsSold> Cartons,
    IReadOnlyList<DaySummary> Days);
