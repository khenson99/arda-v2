import * as React from "react";
import { Loader2, Upload, User } from "lucide-react";
import { toast } from "sonner";
import type { AuthSession } from "@/types";
import { changePassword, uploadAvatar } from "@/lib/api-client";
import { parseApiError, isUnauthorized } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
} from "@/components/ui";
import { Label } from "@/components/ui/label";
import { NotificationPreferencesForm } from "@/components/notifications/notification-preferences";

interface ProfilePageProps {
  session: AuthSession;
  onUnauthorized: () => void;
}

export function ProfilePage({ session, onUnauthorized }: ProfilePageProps) {
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isChangingPassword, setIsChangingPassword] = React.useState(false);
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { user } = session;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }

    setIsChangingPassword(true);

    try {
      await changePassword(session.tokens.accessToken, {
        currentPassword,
        newPassword,
      });

      toast.success("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized();
        return;
      }
      toast.error(parseApiError(error));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    setAvatarFile(file);

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile) return;

    setIsUploadingAvatar(true);

    try {
      await uploadAvatar(session.tokens.accessToken, avatarFile);
      toast.success("Avatar uploaded successfully");
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (error) {
      if (isUnauthorized(error)) {
        onUnauthorized();
        return;
      }
      toast.error(parseApiError(error));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="card-arda">
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
          <CardDescription>
            View and manage your account settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Name</Label>
              <p className="font-semibold">
                {user.firstName} {user.lastName}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Email</Label>
              <p className="font-semibold">{user.email}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Role</Label>
              <p className="font-semibold">{user.role.replaceAll("_", " ")}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Organization</Label>
              <p className="font-semibold">{user.tenantName}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="card-arda">
        <CardHeader>
          <CardTitle>Profile Picture</CardTitle>
          <CardDescription>
            Upload a profile picture (max 5MB)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
              {avatarPreview ? (
                <img
                  src={avatarPreview}
                  alt="Avatar preview"
                  className="h-full w-full rounded-full object-cover"
                />
              ) : user.tenantLogo ? (
                <img
                  src={user.tenantLogo}
                  alt="Current avatar"
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <User className="h-12 w-12 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
              >
                <Upload className="h-4 w-4" />
                Choose File
              </Button>
              {avatarFile && (
                <Button
                  type="button"
                  onClick={handleAvatarUpload}
                  disabled={isUploadingAvatar}
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="card-arda">
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <Input
                id="current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                disabled={isChangingPassword}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                disabled={isChangingPassword}
              />
              <p className="text-xs text-muted-foreground">
                Must be at least 8 characters
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={isChangingPassword}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                disabled={isChangingPassword}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isChangingPassword}>
                {isChangingPassword ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Change Password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <NotificationPreferencesForm
        token={session.tokens.accessToken}
        onUnauthorized={onUnauthorized}
      />
    </div>
  );
}
