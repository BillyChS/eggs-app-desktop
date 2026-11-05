using System.Windows;
using EggsApp.Api.Hosting;

namespace EggsApp.Desktop;

/// <summary>
/// Failure message with large text and buttons. The system MessageBox is too small for the user.
/// </summary>
public partial class FailureDialog : Window
{
    private FailureDialog(string message)
    {
        InitializeComponent();
        MessageText.Text = message;
        HintText.Text = UiText.LogFolderHint;
        LogFolderText.Text = AppDataPaths.Logs;
    }

    /// <summary>
    /// Shows a message with a single button. Never throws: it may be the last thing the app does.
    /// </summary>
    public static void ShowMessage(string message)
    {
        try
        {
            var dialog = new FailureDialog(message);
            dialog.PrimaryButton.Content = UiText.Accept;
            dialog.ShowWithOwner();
        }
        catch (Exception)
        {
            MessageBox.Show($"{message}\n\n{UiText.LogFolderHint}\n{AppDataPaths.Logs}", "Eggs App");
        }
    }

    /// <summary>
    /// Asks a yes/no question.
    /// </summary>
    /// <param name="message">The question.</param>
    /// <param name="noIsSafe">Yes would lose something, so a stray Enter must mean No.</param>
    public static bool Confirm(string message, bool noIsSafe = false)
    {
        var dialog = new FailureDialog(message);
        dialog.PrimaryButton.Content = UiText.Yes;
        dialog.SecondaryButton.Content = UiText.No;
        dialog.SecondaryButton.Visibility = Visibility.Visible;

        if (noIsSafe)
        {
            dialog.PrimaryButton.IsDefault = false;
            dialog.SecondaryButton.IsDefault = true;
            dialog.Loaded += (_, _) => dialog.SecondaryButton.Focus();
        }

        // A question to answer, not a failure to report: the log folder would only get in the way.
        dialog.HintText.Visibility = Visibility.Collapsed;
        dialog.LogFolderText.Visibility = Visibility.Collapsed;

        return dialog.ShowWithOwner() == true;
    }

    private bool? ShowWithOwner()
    {
        var owner = Application.Current?.MainWindow;

        if (owner is { IsVisible: true } && !ReferenceEquals(owner, this))
        {
            Owner = owner;
            WindowStartupLocation = WindowStartupLocation.CenterOwner;
        }

        return ShowDialog();
    }

    private void OnPrimaryClick(object sender, RoutedEventArgs e) => DialogResult = true;
}
