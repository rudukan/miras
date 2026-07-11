<script lang="ts">
  import type { SupabaseClient, User } from '@supabase/supabase-js';
  import { validateNickname } from '$lib/domain/nickname/nickname';

  let {
    supabase,
    onDeleted,
    onSignOut,
    onSwitchAccount,
    onGuestSession,
    onEmailAuth,
  }: {
    supabase: SupabaseClient;
    onDeleted: () => void;
    onSignOut: () => Promise<string | null>;
    onSwitchAccount: () => void;
    onGuestSession: () => Promise<void>;
    onEmailAuth: () => void;
  } = $props();

  let user = $state<User | null>(null);
  let authChecked = $state(false); // getUser döndü mü — 'Oturum açılıyor…' ile 'oturum yok' ayrımı
  let nickname = $state('');
  let savedNickname = $state<string | null>(null);
  let message = $state<string | null>(null);
  let confirmingDelete = $state(false);
  let confirmingSignOut = $state(false);
  let offeringSwitch = $state(false); // identity_already_exists sonrası geçiş teklifi
  let confirmingSwitch = $state(false);
  let guestBusy = $state(false);

  const isGoogleLinked = $derived(user?.identities?.some((i) => i.provider === 'google') ?? false);
  // Kalıcı hesap = anonim değil (Google VEYA e-posta) — ÇIKIŞ YAP yalnız bunlara (spec §4.H).
  const isPermanent = $derived(user !== null && user.is_anonymous !== true);

  $effect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelled) return;
        user = data.user;
        authChecked = true;
        if (!data.user) return;
        const { data: profile } = await supabase
          .from('profiles')
          .select('nickname')
          .eq('id', data.user.id)
          .maybeSingle();
        if (cancelled) return;
        savedNickname = profile?.nickname ?? null;
      } catch (err) {
        if (!cancelled) {
          console.error('[account] oturum bilgileri yüklenemedi', err);
          authChecked = true;
          message = 'Oturum bilgileri yüklenemedi, sayfayı yenile';
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  async function linkGoogle() {
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: { redirectTo: location.origin + '/auth/callback' },
      });
      if (error) {
        // Bu Google başka hesaba bağlı → geçiş teklifi (spec §4.H).
        if ((error as { code?: string }).code === 'identity_already_exists') {
          offeringSwitch = true;
          message = 'Bu Google hesabı zaten kayıtlı. Geçersen buradaki misafir oyunu SİLİNİR.';
        } else {
          message = 'Google bağlantısı başarısız: ' + error.message;
        }
      }
    } catch (err) {
      console.error('[account] linkIdentity hatası', err);
      message = 'Google bağlantısı başarısız, tekrar dene';
    }
  }

  function switchAccount() {
    if (!confirmingSwitch) {
      confirmingSwitch = true;
      return;
    }
    onSwitchAccount();
  }

  async function signInGoogle() {
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + '/auth/callback' },
      });
    } catch (err) {
      console.error('[account] signInWithOAuth hatası', err);
      message = 'Google girişi başlatılamadı, tekrar dene';
    }
  }

  async function startGuestSession() {
    guestBusy = true;
    message = null;
    try {
      await onGuestSession();
    } catch (err) {
      console.error('[account] misafir oturumu açılamadı', err);
      message = 'Misafir oturumu açılamadı — bağlantını kontrol et';
    } finally {
      guestBusy = false;
    }
  }

  async function signOut() {
    if (!confirmingSignOut) {
      confirmingSignOut = true;
      return;
    }
    const err = await onSignOut();
    if (err) {
      message = err;
      confirmingSignOut = false;
    }
  }

  async function claimNickname() {
    const verdict = validateNickname(nickname);
    if (!verdict.ok) {
      message = verdict.reason;
      return;
    }
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname: verdict.value }),
      });
      if (res.ok) {
        savedNickname = verdict.value;
        message = null;
      } else {
        message = (await res.json().catch(() => null))?.message ?? 'Kaydedilemedi';
      }
    } catch (err) {
      console.error('[account] takma ad kaydedilemedi', err);
      message = 'Kaydedilemedi, bağlantını kontrol et';
    }
  }

  async function deleteAccount() {
    if (!confirmingDelete) {
      confirmingDelete = true;
      return;
    }
    let deleted = false;
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        message = 'Hesap silinemedi, tekrar dene';
        confirmingDelete = false;
        return;
      }
      deleted = true;
      onDeleted();
    } catch (err) {
      console.error('[account] silme akışı hatası', err);
      // POST başarılıysa "silinemedi" DEME (spec kapsam eki) — temizlik boot'ta tamamlanır.
      message = deleted
        ? 'Hesap silindi — sayfayı yenile'
        : 'Hesap silinemedi, bağlantını kontrol et';
      confirmingDelete = false;
    }
  }
</script>

<section class="rounded border border-term-border bg-term-panel p-3 font-mono text-sm">
  <h2 class="mb-2 text-term-blue">HESAP</h2>

  {#if !authChecked}
    <p class="text-term-text opacity-50">Oturum açılıyor…</p>
  {:else if user == null}
    <!-- Oturumsuz kalıcı durum (spec §4.K): çerezi silinmiş misafir / çevrimdışı-devam yolu -->
    <p class="mb-2 text-term-amber">Oturum yok — kayıt yalnız bu cihazda.</p>
    <div class="flex flex-wrap gap-2">
      <button class="border border-term-border px-2 py-0.5 hover:bg-term-panelLight" onclick={signInGoogle}>
        GOOGLE İLE GİRİŞ
      </button>
      <button class="border border-term-border px-2 py-0.5 hover:bg-term-panelLight" onclick={onEmailAuth}>
        E-POSTA İLE GİRİŞ
      </button>
      <button
        class="border border-term-border px-2 py-0.5 hover:bg-term-panelLight disabled:opacity-40"
        disabled={guestBusy}
        onclick={() => void startGuestSession()}
      >
        {guestBusy ? 'AÇILIYOR…' : 'MİSAFİR OTURUMU AÇ'}
      </button>
    </div>
    <p class="mt-1 text-[10px] text-term-text opacity-40">Misafir oturumu yeni bulut kimliği oluşturur</p>
  {:else}
    <p class="mb-2">
      Durum:
      {#if isGoogleLinked}
        <span class="text-term-green">Google bağlı</span>
      {:else if isPermanent}
        <span class="text-term-green">E-posta bağlı</span>
      {:else}
        <span class="text-term-amber">Misafir</span>
        <button class="ml-2 border border-term-border px-2 py-0.5 hover:bg-term-panelLight" onclick={() => void linkGoogle()}>
          GOOGLE İLE BAĞLA
        </button>
      {/if}
    </p>

    {#if offeringSwitch}
      <div class="mb-2 border border-term-amber p-2">
        <button class="text-term-amber underline" onclick={switchAccount}>
          {confirmingSwitch
            ? 'EMİN MİSİN? Misafir oyunu silinir, Google hesabına geçilir'
            : 'Misafir oyununu bırak ve Google hesabına geç'}
        </button>
      </div>
    {/if}

    <div class="mb-2 flex items-center gap-2">
      <label for="nickname" class="text-term-text opacity-50">Takma ad:</label>
      {#if savedNickname}
        <span class="text-term-green">{savedNickname}</span>
      {:else}
        <input
          id="nickname"
          class="w-40 border border-term-border bg-transparent px-1"
          bind:value={nickname}
          maxlength="20"
        />
        <button class="border border-term-border px-2 py-0.5 hover:bg-term-panelLight" onclick={() => void claimNickname()}>
          AL
        </button>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-3">
      {#if isPermanent}
        <button class="text-term-blue underline" onclick={() => void signOut()}>
          {confirmingSignOut ? 'EMİN MİSİN? (kaydın bulutta — girince kaldığın yerden)' : 'ÇIKIŞ YAP'}
        </button>
      {/if}
      <button class="text-term-red underline" onclick={() => void deleteAccount()}>
        {confirmingDelete ? 'EMİN MİSİN? (geri dönüşü yok)' : 'Hesabımı ve verilerimi sil'}
      </button>
    </div>
  {/if}

  {#if message}
    <p class="mt-2 text-term-amber">{message}</p>
  {/if}
</section>
