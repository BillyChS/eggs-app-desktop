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

/// <summary>What one customer bought in the period, cash and fiado both.</summary>
/// <param name="Fifteens">Cartons of 15 eggs (type A).</param>
/// <param name="Thirties">Cartons of 30 eggs (type B).</param>
/// <param name="Total">What their sales added up to.</param>
public sealed record CustomerBought(Guid Id, string Name, bool IsDeleted, long Fifteens, long Thirties, long Total);

/// <summary>
/// Customers ranked by what they bought. Only sales with a customer can count, so what was sold to nobody in
/// particular is given apart, and the two always add up to all the period's sales.
/// </summary>
/// <param name="Top">The first <see cref="GetSummary.TopCustomers"/>, by total, then cartons, then name.</param>
/// <param name="OthersCount">How many more customers bought something.</param>
/// <param name="OthersTotal">What those others bought.</param>
/// <param name="WithoutCustomer">Sales with no customer: cash sales where nobody was named.</param>
public sealed record BestCustomers(
    IReadOnlyList<CustomerBought> Top,
    int OthersCount,
    long OthersTotal,
    long WithoutCustomer);

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
    IReadOnlyList<DaySummary> Days,
    BestCustomers BestCustomers);
