-- TRIGGERS OPCIONAIS (JOBY)
-- Este arquivo cria notificações automaticamente a partir de eventos comuns.
-- Ele tenta ser “seguro para rodar”: só cria triggers se as tabelas/colunas existirem.

-- Regras de action_url (versão atual do app):
-- - Mensagens: /messages
-- - Bookings (nova/status/agenda/detalhes): /work-requests
-- - Novo seguidor: /profile/{follower_id} (mais recente no agregado)
-- - Curtidas/comentários (foto/vídeo), vídeo ready/error: /profile/{owner_id}
-- - Reviews: /profile/{professional_id}

-- 1) Mensagens -> notificação para o receiver
DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND to_regclass('public.messages') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'messages'
         AND column_name IN ('sender_id', 'receiver_id', 'content')
       GROUP BY table_name
       HAVING COUNT(*) = 3
     )
  THEN
    -- Se existir coluna de anexo (ex: attachment_url), usa fallback de anexo somente quando content estiver vazio.
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'messages'
        AND column_name = 'attachment_url'
      LIMIT 1
    ) THEN
      CREATE OR REPLACE FUNCTION public.notify_on_message_insert()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $fn$
      BEGIN
        INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
        VALUES (
          NEW.receiver_id,
          'message',
          'Nova mensagem',
          CASE
            WHEN NULLIF(left(NEW.content, 160), '') IS NOT NULL THEN left(NEW.content, 160)
            WHEN NEW.attachment_url IS NOT NULL THEN '📎 Você recebeu um anexo.'
            ELSE 'Você recebeu uma nova mensagem.'
          END,
          '/messages',
          jsonb_build_object(
            'sender_id', NEW.sender_id,
            'message_id', NEW.id
          )
        );
        RETURN NEW;
      END;
      $fn$;
    ELSE
      CREATE OR REPLACE FUNCTION public.notify_on_message_insert()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $fn$
      BEGIN
        INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
        VALUES (
          NEW.receiver_id,
          'message',
          'Nova mensagem',
          COALESCE(NULLIF(left(NEW.content, 160), ''), 'Você recebeu uma nova mensagem.'),
          '/messages',
          jsonb_build_object(
            'sender_id', NEW.sender_id,
            'message_id', NEW.id
          )
        );
        RETURN NEW;
      END;
      $fn$;
    END IF;

    DROP TRIGGER IF EXISTS trg_notify_message_insert ON public.messages;
    CREATE TRIGGER trg_notify_message_insert
      AFTER INSERT ON public.messages
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_message_insert();
  END IF;
END;
$do$;

-- 2) Solicitações (bookings insert) -> notificação para o profissional
DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND to_regclass('public.bookings') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'bookings'
         AND column_name IN ('client_id', 'professional_id', 'id')
       GROUP BY table_name
       HAVING COUNT(*) = 3
     )
  THEN
    CREATE OR REPLACE FUNCTION public.notify_on_booking_insert()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
      VALUES (
        NEW.professional_id,
        'work_request',
        'Nova solicitação de serviço',
        'Você recebeu uma nova solicitação. Toque para ver os detalhes.',
        '/work-requests',
        jsonb_build_object(
          'booking_id', NEW.id,
          'client_id', NEW.client_id
        )
      );
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_notify_booking_insert ON public.bookings;
    CREATE TRIGGER trg_notify_booking_insert
      AFTER INSERT ON public.bookings
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_booking_insert();
  END IF;
END;
$do$;

-- 3) Mudança de status (bookings update) -> notificação para cliente e/ou profissional
DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND to_regclass('public.bookings') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'bookings'
         AND column_name IN ('client_id', 'professional_id', 'status', 'id')
       GROUP BY table_name
       HAVING COUNT(*) = 4
     )
  THEN
    CREATE OR REPLACE FUNCTION public.notify_on_booking_status_change()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      msg text;
    BEGIN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        msg := 'Sua solicitação foi atualizada: ' || COALESCE(NEW.status, '');

        -- Cliente
        INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
        VALUES (
          NEW.client_id,
          'work_request',
          'Atualização da solicitação',
          msg,
          '/work-requests',
          jsonb_build_object(
            'booking_id', NEW.id,
            'status', NEW.status
          )
        );

        -- Profissional
        INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
        VALUES (
          NEW.professional_id,
          'work_request',
          'Status da solicitação alterado',
          msg,
          '/work-requests',
          jsonb_build_object(
            'booking_id', NEW.id,
            'status', NEW.status
          )
        );
      END IF;

      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_notify_booking_status_update ON public.bookings;
    CREATE TRIGGER trg_notify_booking_status_update
      AFTER UPDATE OF status ON public.bookings
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_booking_status_change();
  END IF;
END;
$do$;

-- 4) Novo seguidor -> notificação para o usuário seguido
DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND to_regclass('public.follows') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'follows'
         AND column_name IN ('follower_id', 'following_id')
       GROUP BY table_name
       HAVING COUNT(*) = 2
     )
  THEN
    CREATE OR REPLACE FUNCTION public.notify_on_follow_insert()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_notif_id uuid;
      v_data jsonb;
      v_existing_actors jsonb;
      v_combined_actors jsonb;
      v_new_actors jsonb;
      v_actors_count int;
      v_action_url text;
      v_actor_id text;
      v_has_updated_at boolean;
    BEGIN
      -- evitar notificações inválidas
      IF NEW.follower_id IS NULL OR NEW.following_id IS NULL OR NEW.follower_id = NEW.following_id THEN
        RETURN NEW;
      END IF;

      v_action_url := '/profile/' || NEW.follower_id::text;
      v_actor_id := NEW.follower_id::text;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND column_name = 'updated_at'
        LIMIT 1
      ) INTO v_has_updated_at;

      -- Janela de agregação: 15 minutos por usuário
      SELECT n.id, n.data
      INTO v_notif_id, v_data
      FROM public.notifications n
      WHERE n.user_id = NEW.following_id
        AND n.type = 'follow_aggregate'
        AND n.created_at > (now() - interval '15 minutes')
        AND (n.data->>'following_id') = NEW.following_id::text
      ORDER BY n.created_at DESC
      LIMIT 1;

      IF v_notif_id IS NULL THEN
        INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
        VALUES (
          NEW.following_id,
          'follow_aggregate',
          'Novos seguidores',
          'Você tem novos seguidores.',
          v_action_url,
          jsonb_build_object(
            'following_id', NEW.following_id::text,
            'actors', jsonb_build_array(v_actor_id),
            'actors_count', 1
          )
        );

        RETURN NEW;
      END IF;

      v_existing_actors := COALESCE(v_data->'actors', '[]'::jsonb);

      -- se já está no agregado, apenas atualiza o action_url (mais recente)
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_existing_actors) a
        WHERE a = v_actor_id
        LIMIT 1
      ) THEN
        IF v_has_updated_at THEN
          UPDATE public.notifications
          SET action_url = v_action_url,
              is_read = false,
              read_at = null,
              updated_at = now()
          WHERE id = v_notif_id;
        ELSE
          UPDATE public.notifications
          SET action_url = v_action_url,
              is_read = false,
              read_at = null
          WHERE id = v_notif_id;
        END IF;
        RETURN NEW;
      END IF;

      v_actors_count := COALESCE((v_data->>'actors_count')::int, 0) + 1;

      v_combined_actors := jsonb_build_array(v_actor_id) || v_existing_actors;
      SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
      INTO v_new_actors
      FROM (
        SELECT val
        FROM jsonb_array_elements_text(v_combined_actors) WITH ORDINALITY AS e(val, idx)
        WHERE idx <= 3
      ) s;

      IF v_has_updated_at THEN
        UPDATE public.notifications
        SET title = 'Novos seguidores',
            body = 'Você tem novos seguidores.',
            action_url = v_action_url,
            data = jsonb_set(
              jsonb_set(COALESCE(v_data, '{}'::jsonb), '{actors}', v_new_actors, true),
              '{actors_count}', to_jsonb(v_actors_count),
              true
            ),
            is_read = false,
            read_at = null,
            updated_at = now()
        WHERE id = v_notif_id;
      ELSE
        UPDATE public.notifications
        SET title = 'Novos seguidores',
            body = 'Você tem novos seguidores.',
            action_url = v_action_url,
            data = jsonb_set(
              jsonb_set(COALESCE(v_data, '{}'::jsonb), '{actors}', v_new_actors, true),
              '{actors_count}', to_jsonb(v_actors_count),
              true
            ),
            is_read = false,
            read_at = null
        WHERE id = v_notif_id;
      END IF;

      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_notify_follow_insert ON public.follows;
    CREATE TRIGGER trg_notify_follow_insert
      AFTER INSERT ON public.follows
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_follow_insert();
  END IF;
END;
$do$;

-- 5) Curtida em vídeo -> notificação para o dono do vídeo (anti-spam: 1 a cada 15 min por vídeo)
DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND to_regclass('public.video_likes') IS NOT NULL
     AND to_regclass('public.videos') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'video_likes'
         AND column_name IN ('video_id', 'user_id')
       GROUP BY table_name
       HAVING COUNT(*) = 2
     )
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'videos'
         AND column_name IN ('id', 'user_id')
       GROUP BY table_name
       HAVING COUNT(*) = 2
     )
  THEN
    CREATE OR REPLACE FUNCTION public.notify_on_video_like_insert()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_owner_id uuid;
      v_action_url text;
      v_notif_id uuid;
      v_data jsonb;
      v_existing_actors jsonb;
      v_combined_actors jsonb;
      v_new_actors jsonb;
      v_actors_count int;
      v_actor_id text;
      v_has_updated_at boolean;
    BEGIN
      SELECT user_id INTO v_owner_id
      FROM public.videos
      WHERE id = NEW.video_id;

      IF v_owner_id IS NULL OR NEW.user_id IS NULL OR v_owner_id = NEW.user_id THEN
        RETURN NEW;
      END IF;

      v_action_url := '/profile/' || v_owner_id::text;
      v_actor_id := NEW.user_id::text;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND column_name = 'updated_at'
        LIMIT 1
      ) INTO v_has_updated_at;

      -- Janela de agregação: 15 minutos por vídeo
      SELECT n.id, n.data
      INTO v_notif_id, v_data
      FROM public.notifications n
      WHERE n.user_id = v_owner_id
        AND n.type = 'like_aggregate_video'
        AND n.created_at > (now() - interval '15 minutes')
        AND (n.data->>'video_id') = NEW.video_id::text
      ORDER BY n.created_at DESC
      LIMIT 1;

      IF v_notif_id IS NULL THEN
        INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
        VALUES (
          v_owner_id,
          'like_aggregate_video',
          'Curtidas',
          'Curtiram seu vídeo.',
          v_action_url,
          jsonb_build_object(
            'video_id', NEW.video_id::text,
            'open_content', 'video',
            'content_id', NEW.video_id::text,
            'actors', jsonb_build_array(v_actor_id),
            'actors_count', 1
          )
        );
        RETURN NEW;
      END IF;

      v_existing_actors := COALESCE(v_data->'actors', '[]'::jsonb);

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_existing_actors) a
        WHERE a = v_actor_id
        LIMIT 1
      ) THEN
        IF v_has_updated_at THEN
          UPDATE public.notifications
          SET action_url = v_action_url,
              is_read = false,
              read_at = null,
              updated_at = now()
          WHERE id = v_notif_id;
        ELSE
          UPDATE public.notifications
          SET action_url = v_action_url,
              is_read = false,
              read_at = null
          WHERE id = v_notif_id;
        END IF;
        RETURN NEW;
      END IF;

      v_actors_count := COALESCE((v_data->>'actors_count')::int, 0) + 1;

      v_combined_actors := jsonb_build_array(v_actor_id) || v_existing_actors;
      SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
      INTO v_new_actors
      FROM (
        SELECT val
        FROM jsonb_array_elements_text(v_combined_actors) WITH ORDINALITY AS e(val, idx)
        WHERE idx <= 3
      ) s;

      IF v_has_updated_at THEN
        UPDATE public.notifications
        SET title = 'Curtidas',
            body = 'Curtiram seu vídeo.',
            action_url = v_action_url,
            data = jsonb_set(
              jsonb_set(COALESCE(v_data, '{}'::jsonb), '{actors}', v_new_actors, true),
              '{actors_count}', to_jsonb(v_actors_count),
              true
            ),
            is_read = false,
            read_at = null,
            updated_at = now()
        WHERE id = v_notif_id;
      ELSE
        UPDATE public.notifications
        SET title = 'Curtidas',
            body = 'Curtiram seu vídeo.',
            action_url = v_action_url,
            data = jsonb_set(
              jsonb_set(COALESCE(v_data, '{}'::jsonb), '{actors}', v_new_actors, true),
              '{actors_count}', to_jsonb(v_actors_count),
              true
            ),
            is_read = false,
            read_at = null
        WHERE id = v_notif_id;
      END IF;

      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_notify_video_like_insert ON public.video_likes;
    CREATE TRIGGER trg_notify_video_like_insert
      AFTER INSERT ON public.video_likes
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_video_like_insert();
  END IF;
END;
$do$;

-- 6) Curtida em foto -> notificação para o dono da foto (anti-spam: 1 a cada 15 min por foto)
DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND to_regclass('public.photo_likes') IS NOT NULL
     AND to_regclass('public.photos') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'photo_likes'
         AND column_name IN ('photo_id', 'user_id')
       GROUP BY table_name
       HAVING COUNT(*) = 2
     )
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'photos'
         AND column_name IN ('id', 'user_id')
       GROUP BY table_name
       HAVING COUNT(*) = 2
     )
  THEN
    CREATE OR REPLACE FUNCTION public.notify_on_photo_like_insert()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_owner_id uuid;
      v_action_url text;
      v_notif_id uuid;
      v_data jsonb;
      v_existing_actors jsonb;
      v_combined_actors jsonb;
      v_new_actors jsonb;
      v_actors_count int;
      v_actor_id text;
      v_has_updated_at boolean;
    BEGIN
      SELECT user_id INTO v_owner_id
      FROM public.photos
      WHERE id = NEW.photo_id;

      IF v_owner_id IS NULL OR NEW.user_id IS NULL OR v_owner_id = NEW.user_id THEN
        RETURN NEW;
      END IF;

      v_action_url := '/profile/' || v_owner_id::text;
      v_actor_id := NEW.user_id::text;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND column_name = 'updated_at'
        LIMIT 1
      ) INTO v_has_updated_at;

      -- Janela de agregação: 15 minutos por foto
      SELECT n.id, n.data
      INTO v_notif_id, v_data
      FROM public.notifications n
      WHERE n.user_id = v_owner_id
        AND n.type = 'like_aggregate_photo'
        AND n.created_at > (now() - interval '15 minutes')
        AND (n.data->>'photo_id') = NEW.photo_id::text
      ORDER BY n.created_at DESC
      LIMIT 1;

      IF v_notif_id IS NULL THEN
        INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
        VALUES (
          v_owner_id,
          'like_aggregate_photo',
          'Curtidas',
          'Curtiram sua foto.',
          v_action_url,
          jsonb_build_object(
            'photo_id', NEW.photo_id::text,
            'open_content', 'photo',
            'content_id', NEW.photo_id::text,
            'actors', jsonb_build_array(v_actor_id),
            'actors_count', 1
          )
        );
        RETURN NEW;
      END IF;

      v_existing_actors := COALESCE(v_data->'actors', '[]'::jsonb);

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_existing_actors) a
        WHERE a = v_actor_id
        LIMIT 1
      ) THEN
        IF v_has_updated_at THEN
          UPDATE public.notifications
          SET action_url = v_action_url,
              is_read = false,
              read_at = null,
              updated_at = now()
          WHERE id = v_notif_id;
        ELSE
          UPDATE public.notifications
          SET action_url = v_action_url,
              is_read = false,
              read_at = null
          WHERE id = v_notif_id;
        END IF;
        RETURN NEW;
      END IF;

      v_actors_count := COALESCE((v_data->>'actors_count')::int, 0) + 1;

      v_combined_actors := jsonb_build_array(v_actor_id) || v_existing_actors;
      SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
      INTO v_new_actors
      FROM (
        SELECT val
        FROM jsonb_array_elements_text(v_combined_actors) WITH ORDINALITY AS e(val, idx)
        WHERE idx <= 3
      ) s;

      IF v_has_updated_at THEN
        UPDATE public.notifications
        SET title = 'Curtidas',
            body = 'Curtiram sua foto.',
            action_url = v_action_url,
            data = jsonb_set(
              jsonb_set(COALESCE(v_data, '{}'::jsonb), '{actors}', v_new_actors, true),
              '{actors_count}', to_jsonb(v_actors_count),
              true
            ),
            is_read = false,
            read_at = null,
            updated_at = now()
        WHERE id = v_notif_id;
      ELSE
        UPDATE public.notifications
        SET title = 'Curtidas',
            body = 'Curtiram sua foto.',
            action_url = v_action_url,
            data = jsonb_set(
              jsonb_set(COALESCE(v_data, '{}'::jsonb), '{actors}', v_new_actors, true),
              '{actors_count}', to_jsonb(v_actors_count),
              true
            ),
            is_read = false,
            read_at = null
        WHERE id = v_notif_id;
      END IF;

      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_notify_photo_like_insert ON public.photo_likes;
    CREATE TRIGGER trg_notify_photo_like_insert
      AFTER INSERT ON public.photo_likes
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_photo_like_insert();
  END IF;
END;
$do$;

-- 7) Comentário em vídeo/foto -> notificação para o dono do conteúdo (anti-spam: 1 a cada 5 min por item)
DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND to_regclass('public.comments') IS NOT NULL
     AND to_regclass('public.videos') IS NOT NULL
     AND to_regclass('public.photos') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'comments'
         AND column_name IN ('user_id', 'video_id', 'photo_id', 'id', 'content')
       GROUP BY table_name
       HAVING COUNT(*) = 5
     )
  THEN
    CREATE OR REPLACE FUNCTION public.notify_on_comment_insert()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_owner_id uuid;
      v_action_url text;
      v_type text;
      v_title text;
      v_body text;
      v_item_key text;
      v_item_id text;
      v_notif_id uuid;
      v_data jsonb;
      v_existing_actors jsonb;
      v_combined_actors jsonb;
      v_new_actors jsonb;
      v_actors_count int;
      v_actor_id text;
      v_has_updated_at boolean;
    BEGIN
      -- video
      IF NEW.video_id IS NOT NULL THEN
        SELECT user_id INTO v_owner_id
        FROM public.videos
        WHERE id = NEW.video_id;

        v_type := 'comment_aggregate_video';
        v_title := 'Comentários';
        v_body := 'Comentaram no seu vídeo.';
        v_item_key := 'video_id';
        v_item_id := NEW.video_id::text;
      ELSIF NEW.photo_id IS NOT NULL THEN
        SELECT user_id INTO v_owner_id
        FROM public.photos
        WHERE id = NEW.photo_id;

        v_type := 'comment_aggregate_photo';
        v_title := 'Comentários';
        v_body := 'Comentaram na sua foto.';
        v_item_key := 'photo_id';
        v_item_id := NEW.photo_id::text;
      ELSE
        RETURN NEW;
      END IF;

      v_action_url := '/profile/' || v_owner_id::text;
      v_actor_id := NEW.user_id::text;

      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'notifications'
          AND column_name = 'updated_at'
        LIMIT 1
      ) INTO v_has_updated_at;

      IF v_owner_id IS NULL OR NEW.user_id IS NULL OR v_owner_id = NEW.user_id THEN
        RETURN NEW;
      END IF;

      -- Janela de agregação: 5 minutos por item
      SELECT n.id, n.data
      INTO v_notif_id, v_data
      FROM public.notifications n
      WHERE n.user_id = v_owner_id
        AND n.type = v_type
        AND n.created_at > (now() - interval '5 minutes')
        AND (n.data->>v_item_key) = v_item_id
      ORDER BY n.created_at DESC
      LIMIT 1;

      IF v_notif_id IS NULL THEN
        INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
        VALUES (
          v_owner_id,
          v_type,
          v_title,
          v_body,
          v_action_url,
          jsonb_build_object(
            v_item_key, v_item_id,
            'open_content', CASE WHEN v_item_key = 'video_id' THEN 'video' ELSE 'photo' END,
            'content_id', v_item_id,
            'actors', jsonb_build_array(v_actor_id),
            'actors_count', 1,
            'last_comment_id', NEW.id::text
          )
        );
        RETURN NEW;
      END IF;

      v_existing_actors := COALESCE(v_data->'actors', '[]'::jsonb);

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_existing_actors) a
        WHERE a = v_actor_id
        LIMIT 1
      ) THEN
        IF v_has_updated_at THEN
          UPDATE public.notifications
          SET title = v_title,
              body = v_body,
              action_url = v_action_url,
              data = jsonb_set(COALESCE(v_data, '{}'::jsonb), '{last_comment_id}', to_jsonb(NEW.id::text), true),
              is_read = false,
              read_at = null,
              updated_at = now()
          WHERE id = v_notif_id;
        ELSE
          UPDATE public.notifications
          SET title = v_title,
              body = v_body,
              action_url = v_action_url,
              data = jsonb_set(COALESCE(v_data, '{}'::jsonb), '{last_comment_id}', to_jsonb(NEW.id::text), true),
              is_read = false,
              read_at = null
          WHERE id = v_notif_id;
        END IF;
        RETURN NEW;
      END IF;

      v_actors_count := COALESCE((v_data->>'actors_count')::int, 0) + 1;

      v_combined_actors := jsonb_build_array(v_actor_id) || v_existing_actors;
      SELECT COALESCE(jsonb_agg(val), '[]'::jsonb)
      INTO v_new_actors
      FROM (
        SELECT val
        FROM jsonb_array_elements_text(v_combined_actors) WITH ORDINALITY AS e(val, idx)
        WHERE idx <= 3
      ) s;

      IF v_has_updated_at THEN
        UPDATE public.notifications
        SET title = v_title,
            body = v_body,
            action_url = v_action_url,
            data = jsonb_set(
              jsonb_set(
                jsonb_set(COALESCE(v_data, '{}'::jsonb), '{actors}', v_new_actors, true),
                '{actors_count}', to_jsonb(v_actors_count),
                true
              ),
              '{last_comment_id}', to_jsonb(NEW.id::text),
              true
            ),
            is_read = false,
            read_at = null,
            updated_at = now()
        WHERE id = v_notif_id;
      ELSE
        UPDATE public.notifications
        SET title = v_title,
            body = v_body,
            action_url = v_action_url,
            data = jsonb_set(
              jsonb_set(
                jsonb_set(COALESCE(v_data, '{}'::jsonb), '{actors}', v_new_actors, true),
                '{actors_count}', to_jsonb(v_actors_count),
                true
              ),
              '{last_comment_id}', to_jsonb(NEW.id::text),
              true
            ),
            is_read = false,
            read_at = null
        WHERE id = v_notif_id;
      END IF;

      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_notify_comment_insert ON public.comments;
    CREATE TRIGGER trg_notify_comment_insert
      AFTER INSERT ON public.comments
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_comment_insert();
  END IF;
END;
$do$;

-- 8) Avaliações -> notificação para o profissional avaliado
DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND to_regclass('public.reviews') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'reviews'
         AND column_name IN ('id', 'professional_id', 'client_id', 'rating', 'comment')
       GROUP BY table_name
       HAVING COUNT(*) >= 4
     )
  THEN
    CREATE OR REPLACE FUNCTION public.notify_on_review_insert()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_action_url text;
      v_body text;
    BEGIN
      IF NEW.professional_id IS NULL OR NEW.client_id IS NULL OR NEW.professional_id = NEW.client_id THEN
        RETURN NEW;
      END IF;

      v_action_url := '/profile/' || NEW.professional_id::text;
      v_body := 'Você recebeu uma avaliação (' || COALESCE(NEW.rating::text, '?') || '/5).';

      INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
      VALUES (
        NEW.professional_id,
        'review',
        'Nova avaliação',
        v_body,
        v_action_url,
        jsonb_build_object(
          'review_id', NEW.id,
          'client_id', NEW.client_id,
          'rating', NEW.rating
        )
      );

      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_notify_review_insert ON public.reviews;
    CREATE TRIGGER trg_notify_review_insert
      AFTER INSERT ON public.reviews
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_review_insert();
  END IF;
END;
$do$;

-- 9) Vídeo ready/error -> notificação para o dono do vídeo
DO $do$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND to_regclass('public.videos') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'videos'
         AND column_name IN ('id', 'user_id', 'video_status')
       GROUP BY table_name
       HAVING COUNT(*) = 3
     )
  THEN
    CREATE OR REPLACE FUNCTION public.notify_on_video_status_change()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_action_url text;
    BEGIN
      IF NEW.video_status IS DISTINCT FROM OLD.video_status THEN
        IF NEW.user_id IS NULL THEN
          RETURN NEW;
        END IF;

        v_action_url := '/profile/' || NEW.user_id::text;

        IF NEW.video_status = 'ready' THEN
          INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
          VALUES (
            NEW.user_id,
            'system',
            'Vídeo pronto',
            'Seu vídeo terminou de processar e já está disponível.',
            v_action_url,
            jsonb_build_object(
              'video_id', NEW.id,
              'video_status', NEW.video_status
            )
          );
        ELSIF NEW.video_status = 'error' THEN
          INSERT INTO public.notifications (user_id, type, title, body, action_url, data)
          VALUES (
            NEW.user_id,
            'system',
            'Falha no vídeo',
            'Ocorreu um erro ao processar seu vídeo. Tente reenviar.',
            v_action_url,
            jsonb_build_object(
              'video_id', NEW.id,
              'video_status', NEW.video_status
            )
          );
        END IF;
      END IF;

      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_notify_video_status_update ON public.videos;
    CREATE TRIGGER trg_notify_video_status_update
      AFTER UPDATE OF video_status ON public.videos
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_on_video_status_change();
  END IF;
END;
$do$;
